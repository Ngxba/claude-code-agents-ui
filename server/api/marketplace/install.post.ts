export default defineEventHandler(async (event) => {
  const { marketplace, plugin } = await readBody<{ marketplace: string; plugin: string }>(event)

  if (!marketplace || !plugin) {
    throw createError({ statusCode: 400, message: 'marketplace and plugin are required' })
  }

  const identifier = `${plugin}@${marketplace}`
  console.log(`[Marketplace] Installing plugin: ${identifier}`)

  try {
    const { stdout, stderr } = await runClaude(['plugin', 'install', identifier])
    console.log(`[Marketplace] Success:`, stdout)
    if (stderr) console.warn(`[Marketplace] Stderr:`, stderr)
    
    return { success: true, output: stdout || 'Plugin installed successfully' }
  } catch (e: any) {
    const errorMsg = e.data?.message || e.message || 'Unknown error'
    console.error(`[Marketplace] Failed to install ${identifier}:`, errorMsg)
    
    throw createError({
      statusCode: e.statusCode || 500,
      message: `Failed to install plugin "${identifier}": ${errorMsg}`,
      data: e.data
    })
  }
})
