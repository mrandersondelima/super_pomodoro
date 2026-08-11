import { app, BrowserWindow, Notification, ipcMain, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rendererDist = join(__dirname, '../dist')
const indexHtml = join(rendererDist, 'index.html')
const preloadPath = join(__dirname, 'preload.js')
const alarmHtmlPath = join(__dirname, 'alarm.html')
const alarmPreloadPath = join(__dirname, 'alarm-preload.js')

let mainWindow = null
let activeAlarmSession = null
const ALARM_SOUND_DURATION_MS = 10_000

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#f6efe2',
    title: 'Super Pomodoro',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    window.loadURL(devServerUrl)
    window.webContents.openDevTools({ mode: 'detach' })
    mainWindow = window
    return
  }

  window.loadFile(indexHtml)
  mainWindow = window
}

app.whenReady().then(() => {
  ipcMain.handle('show-notification', async (_event, payload) => {
    showWindowsNotification(payload)
    await showControlledAlarm(payload)
    return true
  })

  ipcMain.on('alarm-stop', () => {
    stopControlledAlarmSound()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  disposeControlledAlarm()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function showControlledAlarm(payload) {
  disposeControlledAlarm()

  const alarmWindow = new BrowserWindow({
    width: 460,
    height: 290,
    resizable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    alwaysOnTop: true,
    fullscreenable: false,
    title: 'Alerta de cronometro',
    backgroundColor: '#131313',
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    webPreferences: {
      preload: alarmPreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const beepIntervalId = setInterval(() => {
    shell.beep()
  }, 900)

  const stopTimeoutId = setTimeout(() => {
    stopControlledAlarmSound()
  }, ALARM_SOUND_DURATION_MS)

  activeAlarmSession = {
    window: alarmWindow,
    beepIntervalId,
    stopTimeoutId,
  }

  const fileLoadPromise = alarmWindow.loadFile(alarmHtmlPath, {
    query: {
      title: payload.title ?? 'Cronometro finalizado',
      body: payload.body ?? 'O tempo configurado acabou.',
    },
  })

  await fileLoadPromise

  if (activeAlarmSession?.window && !activeAlarmSession.window.isDestroyed()) {
    activeAlarmSession.window.show()
    activeAlarmSession.window.focus()
  }

  alarmWindow.on('closed', () => {
    if (activeAlarmSession?.window === alarmWindow) {
      clearAlarmTimers(activeAlarmSession)
      activeAlarmSession = null
    }
  })
}

function stopControlledAlarm() {
  if (!activeAlarmSession) {
    return
  }

  clearAlarmTimers(activeAlarmSession)
}

function stopControlledAlarmSound() {
  if (!activeAlarmSession) {
    return
  }

  clearAlarmTimers(activeAlarmSession)
}

function disposeControlledAlarm() {
  if (!activeAlarmSession) {
    return
  }

  const alarmWindow = activeAlarmSession.window
  clearAlarmTimers(activeAlarmSession)

  if (alarmWindow && !alarmWindow.isDestroyed()) {
    alarmWindow.close()
  }

  activeAlarmSession = null
}

function clearAlarmTimers(session) {
  clearInterval(session.beepIntervalId)
  clearTimeout(session.stopTimeoutId)

  session.beepIntervalId = undefined
  session.stopTimeoutId = undefined
}

function showWindowsNotification(payload) {
  if (!Notification.isSupported()) {
    return
  }

  const nativeNotification = new Notification({
    title: payload.title ?? 'Cronometro finalizado',
    body: payload.body ?? 'O tempo configurado acabou.',
  })

  nativeNotification.show()
}
