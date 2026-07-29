import { app, BrowserWindow, ipcMain, shell } from 'electron'
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
    await showControlledAlarm(payload)
    return true
  })

  ipcMain.on('alarm-stop', () => {
    stopControlledAlarm()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopControlledAlarm()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function showControlledAlarm(payload) {
  stopControlledAlarm()

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

  activeAlarmSession = {
    window: alarmWindow,
    beepIntervalId,
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

  await new Promise((resolve) => {
    alarmWindow.once('closed', () => {
      if (activeAlarmSession?.window === alarmWindow) {
        clearInterval(activeAlarmSession.beepIntervalId)
        activeAlarmSession = null
      }

      resolve(true)
    })
  })
}

function stopControlledAlarm() {
  if (!activeAlarmSession) {
    return
  }

  clearInterval(activeAlarmSession.beepIntervalId)

  if (activeAlarmSession.window && !activeAlarmSession.window.isDestroyed()) {
    activeAlarmSession.window.close()
  }

  activeAlarmSession = null
}
