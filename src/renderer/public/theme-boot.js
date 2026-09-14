// Paints the last theme's background and text colors before the first frame,
// so the window does not flash the default dark body while the app bundle
// loads settings. Loaded as a classic, parser-blocking script from
// index.html's <head>. The stored value is written by rememberBootTheme in
// src/renderer/src/utils/theme.ts: { light: BootPaint, dark: BootPaint },
// where BootPaint is { app, text, kind }. Keep the key and shape in sync.
(function () {
  var BOOT_THEME_STORAGE_KEY = 'pi-desktop.boot-theme'
  var html = document.documentElement
  var mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  var paint
  try {
    var stored = JSON.parse(localStorage.getItem(BOOT_THEME_STORAGE_KEY))
    paint = stored && stored[mode]
  } catch {
    paint = null
  }
  if (!paint || typeof paint.app !== 'string' || typeof paint.text !== 'string'
      || (paint.kind !== 'light' && paint.kind !== 'dark')) {
    // First launch or unreadable value: clear the stylesheet's dark default
    // app color so the canvas, colored by the OS mode, shows through.
    html.style.setProperty('--color-app', 'transparent')
    html.style.colorScheme = mode
    return
  }
  html.style.setProperty('--color-app', paint.app)
  html.style.setProperty('--color-primary', paint.text)
  html.style.colorScheme = paint.kind
  html.classList.toggle('light', paint.kind === 'light')
})()
