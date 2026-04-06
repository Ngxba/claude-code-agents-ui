// server/api/v2/providers/config.get.ts
import { getProviderConfig } from '../../../utils/providers/providerConfig'

function maskToken(token: string): string {
  if (token.length <= 6) return '***'
  return token.slice(0, 3) + '***'
}

export default defineEventHandler(async () => {
  const config = await getProviderConfig()
  return {
    ...config,
    providers: config.providers.map(p => ({
      ...p,
      authToken: p.authToken ? maskToken(p.authToken) : undefined,
    })),
  }
})
