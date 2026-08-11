<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useTheme } from 'vuetify'

type TimerStep = {
  id: number
  title: string
  minutes: number
  alertMessage: string
}

const STORAGE_KEY = 'super-pomodoro-timers'
const SETTINGS_STORAGE_KEY = 'super-pomodoro-settings'
const THEME_STORAGE_KEY = 'super-pomodoro-theme'

const defaultTimers: TimerStep[] = [
  {
    id: 1,
    title: 'Ficar sentado',
    minutes: 40,
    alertMessage: 'Tempo de ficar sentado acabou.',
  },
  {
    id: 2,
    title: 'Ficar em pé',
    minutes: 15,
    alertMessage: 'Tempo de ficar em pé acabou.',
  },
]

const timers = ref<TimerStep[]>(loadStoredTimers())

const nextId = ref(getNextId(timers.value))
const editingTimerId = ref<number | null>(null)
const newTitle = ref('')
const newMinutes = ref(10)
const newAlertMessage = ref('')
const loopSequence = ref(loadLoopSetting())

const isRunning = ref(false)
const currentIndex = ref(0)
const remainingSeconds = ref(0)
const completedCount = ref(0)
const hasFinished = ref(false)
const inAppAlarmVisible = ref(false)
const inAppAlarmTitle = ref('')
const inAppAlarmBody = ref('')
const theme = useTheme()
const isDarkMode = ref(loadThemePreference())

let inAppAlarmResolve: (() => void) | null = null
let inAppAlarmIntervalId: number | undefined
let inAppAlarmTimeoutId: number | undefined
let isCompletingTimer = false

const IN_APP_ALARM_SOUND_DURATION_MS = 10_000

let intervalId: number | undefined

const currentTimer = computed(() => timers.value[currentIndex.value] ?? null)
const totalTimers = computed(() => timers.value.length)
const totalDurationMinutes = computed(() =>
  timers.value.reduce((sum, timer) => sum + timer.minutes, 0),
)

const currentProgress = computed(() => {
  if (!currentTimer.value) {
    return 0
  }

  const totalSeconds = currentTimer.value.minutes * 60

  if (!totalSeconds) {
    return 0
  }

  return Math.max(0, Math.min(100, ((totalSeconds - remainingSeconds.value) / totalSeconds) * 100))
})

const queueProgress = computed(() => {
  if (!totalTimers.value) {
    return 0
  }

  return ((completedCount.value % totalTimers.value) / totalTimers.value) * 100
})

const formattedTime = computed(() => formatSeconds(remainingSeconds.value))

watch(
  timers,
  (nextTimers) => {
    saveTimers(nextTimers)
  },
  { deep: true },
)

watch(loopSequence, (nextValue) => {
  saveLoopSetting(nextValue)
})

watch(isDarkMode, (nextValue) => {
  applyThemePreference(nextValue)
}, { immediate: true })

watch(
  timers,
  (nextTimers) => {
    if (!nextTimers.length) {
      stopInterval()
      isRunning.value = false
      currentIndex.value = 0
      remainingSeconds.value = 0
      completedCount.value = 0
      hasFinished.value = false
      return
    }

    if (!isRunning.value) {
      currentIndex.value = Math.min(currentIndex.value, nextTimers.length - 1)
      remainingSeconds.value = nextTimers[currentIndex.value].minutes * 60
    }
  },
  { deep: true, immediate: true },
)

onBeforeUnmount(() => {
  stopInterval()
  stopInAppAlarmSound()
  inAppAlarmVisible.value = false
})

function loadThemePreference() {
  try {
    const rawValue = window.localStorage.getItem(THEME_STORAGE_KEY)
    return rawValue === 'dark'
  }
  catch {
    return false
  }
}

function saveThemePreference(nextValue: boolean) {
  window.localStorage.setItem(THEME_STORAGE_KEY, nextValue ? 'dark' : 'light')
}

function applyThemePreference(nextValue: boolean) {
  theme.global.name.value = nextValue ? 'superPomodoroDark' : 'superPomodoroLight'
  document.documentElement.setAttribute('data-theme', nextValue ? 'dark' : 'light')
  saveThemePreference(nextValue)
}

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value
}

function addTimer() {
  const title = newTitle.value.trim()
  const minutes = Number(newMinutes.value)
  const alertMessage = newAlertMessage.value.trim()

  if (!title || !minutes || minutes < 1) {
    return
  }

  if (editingTimerId.value !== null) {
    updateTimer({
      id: editingTimerId.value,
      title,
      minutes,
      alertMessage: alertMessage || `Tempo de ${title.toLowerCase()} acabou.`,
    })
    resetForm()
    return
  }

  timers.value.push({
    id: nextId.value,
    title,
    minutes,
    alertMessage: alertMessage || `Tempo de ${title.toLowerCase()} acabou.`,
  })

  nextId.value += 1
  resetForm()
}

function editTimer(id: number) {
  if (isRunning.value) {
    return
  }

  const timer = timers.value.find((item) => item.id === id)

  if (!timer) {
    return
  }

  editingTimerId.value = timer.id
  newTitle.value = timer.title
  newMinutes.value = timer.minutes
  newAlertMessage.value = timer.alertMessage
}

function removeTimer(id: number) {
  if (isRunning.value) {
    return
  }

  timers.value = timers.value.filter((timer) => timer.id !== id)

  if (editingTimerId.value === id) {
    resetForm()
  }
}

function moveTimer(index: number, direction: -1 | 1) {
  if (isRunning.value) {
    return
  }

  const targetIndex = index + direction

  if (targetIndex < 0 || targetIndex >= timers.value.length) {
    return
  }

  const updatedTimers = [...timers.value]
  const [timer] = updatedTimers.splice(index, 1)
  updatedTimers.splice(targetIndex, 0, timer)
  timers.value = updatedTimers
}

function startSequence() {
  if (!timers.value.length) {
    return
  }

  if (hasFinished.value || remainingSeconds.value <= 0) {
    currentIndex.value = 0
    completedCount.value = 0
    hasFinished.value = false
    remainingSeconds.value = timers.value[0].minutes * 60
  }

  if (isRunning.value) {
    return
  }

  isRunning.value = true
  startInterval()
}

function pauseSequence() {
  isRunning.value = false
  stopInterval()
}

function resetSequence() {
  pauseSequence()
  currentIndex.value = 0
  completedCount.value = 0
  hasFinished.value = false
  remainingSeconds.value = timers.value[0]?.minutes ? timers.value[0].minutes * 60 : 0
}

function skipCurrentTimer() {
  if (!timers.value.length || isCompletingTimer) {
    return
  }

  stopInterval()
  completedCount.value += 1

  if (currentIndex.value < timers.value.length - 1) {
    currentIndex.value += 1
    remainingSeconds.value = timers.value[currentIndex.value].minutes * 60

    if (isRunning.value) {
      startInterval()
    }

    return
  }

  if (loopSequence.value && timers.value.length > 0) {
    currentIndex.value = 0
    completedCount.value = 0
    hasFinished.value = false
    remainingSeconds.value = timers.value[0].minutes * 60

    if (isRunning.value) {
      startInterval()
    }

    return
  }

  pauseSequence()
  hasFinished.value = true
  remainingSeconds.value = 0
}

function startInterval() {
  stopInterval()

  intervalId = window.setInterval(() => {
    if (isCompletingTimer) {
      return
    }

    if (remainingSeconds.value > 1) {
      remainingSeconds.value -= 1
      return
    }

    completeCurrentTimer()
  }, 1000)
}

function stopInterval() {
  if (intervalId !== undefined) {
    window.clearInterval(intervalId)
    intervalId = undefined
  }
}

function updateTimer(updatedTimer: TimerStep) {
  timers.value = timers.value.map((timer) =>
    timer.id === updatedTimer.id ? updatedTimer : timer,
  )
}

function resetForm() {
  editingTimerId.value = null
  newTitle.value = ''
  newMinutes.value = 10
  newAlertMessage.value = ''
}

async function completeCurrentTimer() {
  if (isCompletingTimer) {
    return
  }

  isCompletingTimer = true
  stopInterval()

  const finishedTimer = currentTimer.value

  if (!finishedTimer) {
    pauseSequence()
    isCompletingTimer = false
    return
  }

  try {
    await notify(finishedTimer.title, finishedTimer.alertMessage)
    completedCount.value += 1

    if (currentIndex.value < timers.value.length - 1) {
      currentIndex.value += 1
      remainingSeconds.value = timers.value[currentIndex.value].minutes * 60
      return
    }

    if (loopSequence.value && timers.value.length > 0) {
      currentIndex.value = 0
      completedCount.value = 0
      hasFinished.value = false
      remainingSeconds.value = timers.value[0].minutes * 60
      return
    }

    pauseSequence()
    hasFinished.value = true
    remainingSeconds.value = 0
  }
  finally {
    isCompletingTimer = false

    if (isRunning.value && remainingSeconds.value > 0) {
      startInterval()
    }
  }
}

async function notify(title: string, body: string) {
  await showWindowsAlert(title, body)
  await showInAppAlarm(title, body)
}

async function showWindowsAlert(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body })
    return
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()

    if (permission === 'granted') {
      new Notification(title, { body })
    }
  }
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function loadStoredTimers() {
  const fallbackTimers = defaultTimers.map((timer) => ({ ...timer }))

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)

    if (!rawValue) {
      return fallbackTimers
    }

    const parsedValue = JSON.parse(rawValue)

    if (!Array.isArray(parsedValue)) {
      return fallbackTimers
    }

    const sanitizedTimers = parsedValue
      .map((timer, index) => sanitizeTimer(timer, index))
      .filter((timer): timer is TimerStep => timer !== null)

    return sanitizedTimers.length ? sanitizedTimers : fallbackTimers
  }
  catch {
    return fallbackTimers
  }
}

function saveTimers(nextTimers: TimerStep[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTimers))
}

function loadLoopSetting() {
  try {
    const rawValue = window.localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (!rawValue) {
      return false
    }

    const parsedValue = JSON.parse(rawValue) as { loopSequence?: boolean }
    return parsedValue.loopSequence === true
  }
  catch {
    return false
  }
}

function saveLoopSetting(loopValue: boolean) {
  window.localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ loopSequence: loopValue }),
  )
}

function sanitizeTimer(value: unknown, index: number) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<TimerStep>
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : ''
  const alertMessage = typeof candidate.alertMessage === 'string' ? candidate.alertMessage.trim() : ''
  const minutes = Number(candidate.minutes)
  const id = Number(candidate.id)

  if (!title || !alertMessage || !Number.isFinite(minutes) || minutes < 1) {
    return null
  }

  return {
    id: Number.isFinite(id) && id > 0 ? id : index + 1,
    title,
    minutes,
    alertMessage,
  }
}

function getNextId(existingTimers: TimerStep[]) {
  return existingTimers.reduce((highestId, timer) => Math.max(highestId, timer.id), 0) + 1
}

function showInAppAlarm(title: string, body: string) {
  stopInAppAlarmSound()

  inAppAlarmTitle.value = title
  inAppAlarmBody.value = body
  inAppAlarmVisible.value = true
  startInAppAlarmLoop()

  return new Promise<void>((resolve) => {
    inAppAlarmResolve = resolve
  })
}

function stopInAppAlarm() {
  stopInAppAlarmSound()
  inAppAlarmVisible.value = false

  const resolver = inAppAlarmResolve
  inAppAlarmResolve = null

  if (resolver) {
    resolver()
  }
}

function startInAppAlarmLoop() {
  playInAppBeep()
  if (inAppAlarmTimeoutId !== undefined) {
    window.clearTimeout(inAppAlarmTimeoutId)
  }

  inAppAlarmIntervalId = window.setInterval(() => {
    playInAppBeep()
  }, 900)

  inAppAlarmTimeoutId = window.setTimeout(() => {
    stopInAppAlarmSound()
  }, IN_APP_ALARM_SOUND_DURATION_MS)
}

function stopInAppAlarmSound() {
  if (inAppAlarmIntervalId !== undefined) {
    window.clearInterval(inAppAlarmIntervalId)
    inAppAlarmIntervalId = undefined
  }

  if (inAppAlarmTimeoutId !== undefined) {
    window.clearTimeout(inAppAlarmTimeoutId)
    inAppAlarmTimeoutId = undefined
  }
}

function playInAppBeep() {
  if (typeof window === 'undefined' || !('AudioContext' in window || 'webkitAudioContext' in window)) {
    return
  }

  const webkitAudioContext = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  const AudioContextClass = window.AudioContext || webkitAudioContext

  if (!AudioContextClass) {
    return
  }
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gainNode = context.createGain()

  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(860, context.currentTime)
  gainNode.gain.setValueAtTime(0.12, context.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)

  oscillator.connect(gainNode)
  gainNode.connect(context.destination)
  oscillator.start(context.currentTime)
  oscillator.stop(context.currentTime + 0.22)

  oscillator.onended = () => {
    context.close()
  }
}
</script>

<template>
  <v-app>
    <v-main>
      <div class="app-shell" :data-theme="isDarkMode ? 'dark' : 'light'">
        <section class="hero-panel">
          <div class="hero-copy">
            <div class="theme-toggle">
              <span>{{ isDarkMode ? 'Modo noturno ativo' : 'Modo claro ativo' }}</span>
              <v-btn
                :icon="isDarkMode ? 'mdi-weather-night' : 'mdi-weather-sunny'"
                variant="text"
                color="secondary"
                @click="toggleTheme"
              />
            </div>
            <p class="eyebrow">Sequência automática de pausas</p>
            <h1>Monte uma fila de cronômetros para alternar entre sentado e em pé.</h1>
            <p class="hero-text">
              Cada etapa inicia sozinha assim que a anterior termina. O alerta aparece no Windows no exato momento da troca.
            </p>
          </div>

          <v-card class="timer-card" rounded="xl" elevation="0">
            <div class="timer-card__status">
              <span class="status-pill" :class="{ 'status-pill--active': isRunning }">
                {{ isRunning ? 'Em execução' : hasFinished ? 'Sequência concluída' : 'Pronto para iniciar' }}
              </span>
              <span>{{ completedCount }}/{{ totalTimers }} etapas concluídas</span>
            </div>

            <div class="timer-card__body">
              <div>
                <p class="timer-label">Etapa atual</p>
                <h2>{{ currentTimer?.title ?? 'Adicione um cronômetro' }}</h2>
                <p class="timer-message">
                  {{ currentTimer?.alertMessage ?? 'Quando a etapa terminar, o app dispara um alerta e passa para a próxima.' }}
                </p>
              </div>

              <div class="timer-readout">{{ formattedTime }}</div>
            </div>

            <v-progress-linear
              :model-value="currentProgress"
              color="secondary"
              bg-color="rgba(48,95,77,0.12)"
              rounded
              height="12"
            />

            <div class="timer-actions">
              <v-btn color="primary" size="large" rounded="pill" @click="startSequence">
                Iniciar
              </v-btn>
              <v-btn variant="tonal" size="large" rounded="pill" @click="pauseSequence">
                Pausar
              </v-btn>
              <v-btn
                variant="tonal"
                size="large"
                rounded="pill"
                :disabled="!timers.length || isCompletingTimer"
                @click="skipCurrentTimer"
              >
                Pular
              </v-btn>
              <v-btn variant="outlined" size="large" rounded="pill" @click="resetSequence">
                Reiniciar
              </v-btn>
            </div>

            <v-switch
              v-model="loopSequence"
              color="primary"
              density="comfortable"
              hide-details
              inset
              label="Executar a fila em loop"
              :disabled="isRunning"
            />
          </v-card>
        </section>

        <section class="content-grid">
          <v-card class="panel" rounded="xl" elevation="0">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">{{ editingTimerId !== null ? 'Editar cronômetro' : 'Novo cronômetro' }}</p>
                <h3>{{ editingTimerId !== null ? 'Atualizar etapa' : 'Adicionar etapa' }}</h3>
              </div>
              <span class="panel-meta">Total: {{ totalDurationMinutes }} min</span>
            </div>

            <div class="form-grid">
              <v-text-field
                v-model="newTitle"
                label="Título"
                variant="outlined"
                density="comfortable"
                hide-details
                :disabled="isRunning"
              />
              <v-text-field
                v-model.number="newMinutes"
                label="Minutos"
                type="number"
                min="1"
                variant="outlined"
                density="comfortable"
                hide-details
                :disabled="isRunning"
              />
              <v-text-field
                v-model="newAlertMessage"
                label="Mensagem do alerta"
                variant="outlined"
                density="comfortable"
                hide-details
                :disabled="isRunning"
              />
            </div>

            <v-btn
              class="add-button"
              color="secondary"
              size="large"
              rounded="pill"
              :prepend-icon="editingTimerId !== null ? 'mdi-content-save-outline' : 'mdi-plus'"
              :disabled="isRunning || !newTitle.trim() || Number(newMinutes) < 1"
              @click="addTimer"
            >
              {{ editingTimerId !== null ? 'Salvar alterações' : 'Incluir na sequência' }}
            </v-btn>

            <v-btn
              v-if="editingTimerId !== null"
              class="add-button"
              variant="text"
              size="large"
              rounded="pill"
              :disabled="isRunning"
              @click="resetForm"
            >
              Cancelar edição
            </v-btn>
          </v-card>

          <v-card class="panel" rounded="xl" elevation="0">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Fila programada</p>
                <h3>Ordem dos cronômetros</h3>
              </div>
              <span class="panel-meta">Progresso geral {{ Math.round(queueProgress) }}%</span>
            </div>

            <v-progress-linear
              class="queue-progress"
              :model-value="queueProgress"
              color="primary"
              bg-color="rgba(48,95,77,0.08)"
              rounded
            />

            <div v-if="timers.length" class="queue-list">
              <article
                v-for="(timer, index) in timers"
                :key="timer.id"
                class="queue-item"
                :class="{
                  'queue-item--active': index === currentIndex,
                  'queue-item--done': index < completedCount,
                  'queue-item--editing': timer.id === editingTimerId,
                }"
              >
                <div class="queue-item__main">
                  <div>
                    <p class="queue-item__index">Etapa {{ index + 1 }}</p>
                    <p v-if="timer.id === editingTimerId" class="queue-item__editing-label">Em edição</p>
                    <h4>{{ timer.title }}</h4>
                    <p>{{ timer.alertMessage }}</p>
                  </div>
                  <div class="queue-item__duration">{{ timer.minutes }} min</div>
                </div>

                <div class="queue-item__actions">
                  <v-btn
                    icon="mdi-pencil-outline"
                    variant="text"
                    size="small"
                    :disabled="isRunning"
                    @click="editTimer(timer.id)"
                  />
                  <v-btn
                    icon="mdi-arrow-up"
                    variant="text"
                    size="small"
                    :disabled="isRunning || index === 0"
                    @click="moveTimer(index, -1)"
                  />
                  <v-btn
                    icon="mdi-arrow-down"
                    variant="text"
                    size="small"
                    :disabled="isRunning || index === timers.length - 1"
                    @click="moveTimer(index, 1)"
                  />
                  <v-btn
                    icon="mdi-delete-outline"
                    variant="text"
                    size="small"
                    :disabled="isRunning"
                    @click="removeTimer(timer.id)"
                  />
                </div>
              </article>
            </div>

            <v-alert
              v-else
              variant="tonal"
              color="primary"
              text="Nenhum cronômetro cadastrado. Adicione a primeira etapa ao lado."
            />
          </v-card>
        </section>

        <v-dialog v-model="inAppAlarmVisible" persistent width="460">
          <v-card rounded="xl" class="alarm-dialog">
            <v-card-title class="alarm-dialog__title">Alarme ativo</v-card-title>
            <v-card-text>
              <h4>{{ inAppAlarmTitle }}</h4>
              <p>{{ inAppAlarmBody }}</p>
            </v-card-text>
            <v-card-actions class="alarm-dialog__actions">
              <v-btn color="secondary" rounded="pill" size="large" @click="stopInAppAlarm">
                Parar alarme
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>
    </v-main>
  </v-app>
</template>