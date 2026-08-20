const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');

// Flags que destravam qualidade de tela. Sem isso o Chromium embutido
// e mais conservador que o Chrome normal.
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,VaapiVideoDecoder');
app.commandLine.appendSwitch('force-fieldtrials', 'WebRTC-Vp9DependencyDescriptor/Enabled/');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    frame: false,              // barra de titulo propria, no seu estilo
    backgroundColor: '#0e0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // NAO remova: sem isso a chamada
                                   // degrada quando a janela perde o foco
    },
  });

  win.loadURL(process.env.VITE_DEV_SERVER_URL ?? `file://${path.join(__dirname, '../client/dist/index.html')}`);
}

app.whenReady().then(() => {
  // Concede permissao de midia sem popup — e o proprio app do usuario.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'audioCapture', 'videoCapture'].includes(permission));
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Lista telas e janelas para o seletor da UI.
 *
 * Audio do sistema, por plataforma — esta e a parte chata:
 *  - Windows: sai junto no getUserMedia com chromeMediaSource 'desktop'. Funciona.
 *  - Linux: precisa do PipeWire (flag acima) ou de um monitor do PulseAudio.
 *  - macOS: NAO sai. A Apple bloqueia. Exige ScreenCaptureKit nativo ou
 *    um driver virtual (BlackHole). Se macOS for alvo, planeje isso cedo.
 */
ipcMain.handle('desktop:sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen') ? 'screen' : 'window',
    thumbnail: s.thumbnail.toDataURL(),
    icon: s.appIcon?.toDataURL() ?? null,
  }));
});

ipcMain.handle('window:minimize', () => win.minimize());
ipcMain.handle('window:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.handle('window:close', () => win.close());
