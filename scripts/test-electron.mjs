import { _electron as electronApp, expect } from '@playwright/test'

export { expect }
// Interaction scenarios use Korean selectors explicitly. Production defaults to
// English; language/default/persistence coverage uses the raw launcher instead.
export const _electron = {
  async launch(options) {
    const app = await electronApp.launch(options.env?.POKETOKEN_TEST_MODE === '1' ? { ...options, env: { ...options.env, POKETOKEN_TEST_HATCH: 'first' } } : options)
    if (options.env?.POKETOKEN_TEST_MODE === '1' && !options.args?.some(arg => arg.includes('window-fixture.cjs'))) {
      await app.firstWindow()
      await expect.poll(() => app.windows().some(page => page.url().includes('view=dashboard'))).toBe(true)
      const page = app.windows().find(page => page.url().includes('view=dashboard'))
      await page.waitForFunction(() => Boolean(window.desktop))
      await page.evaluate(() => window.desktop.updateSettings({ language: 'ko' }))
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
    }
    return app
  }
}
