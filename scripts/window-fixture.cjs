const { app, BrowserWindow, screen } = require('electron')
app.setPath('userData', process.env.POKETOKEN_FIXTURE_DATA_DIR)
app.whenReady().then(async () => {
  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(760, area.width - 100), height = Math.max(180, Math.min(320, area.height * .35))
  const window = new BrowserWindow({x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+area.height*.55),width,height,show:false,title:'PokeToken window test',backgroundColor:'#eff5e8',webPreferences:{sandbox:true}})
  globalThis.fixtureWindow = window
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="font:18px system-ui;color:#426f4d;background:#eff5e8;padding:36px"><h2>창 위 걷기 테스트</h2><p>이 창은 자동 검증용입니다.</p></body>'))
  window.show(); window.focus()
})
app.on('window-all-closed',()=>app.quit())
