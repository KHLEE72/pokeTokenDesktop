import { expect } from '@playwright/test'

// Session repair retires the old Windows page. Tests must target the new page
// rather than succeeding through a detached renderer kept by the test harness.
export async function currentPet(application, previous, replaced=process.platform==='win32') {
  if(previous && replaced)await expect.poll(()=>previous.isClosed(),{timeout:15000}).toBe(true)
  const candidates=()=>application.windows().filter(page=>!page.isClosed()&&page.url().includes('view=pet'))
  await expect.poll(()=>candidates().length,{timeout:15000}).toBe(1)
  const page=candidates()[0]
  await expect(page.locator('.pet-character')).toBeVisible()
  return page
}
