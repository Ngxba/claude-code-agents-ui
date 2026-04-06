import type { ProviderAdapter, ProviderInfo } from './types'
import { claudeProvider, claudeProviderInfo } from './claudeProvider'

/**
 * Provider registry for managing multiple providers.
 * Currently only Claude is implemented, but the pattern allows for future expansion.
 */
class ProviderRegistry {
  private providers = new Map<string, ProviderAdapter>()
  private providerInfo = new Map<string, ProviderInfo>()
  private defaultProvider = 'claude'

  constructor() {
    // Register Claude provider by default
    this.register(claudeProvider, claudeProviderInfo)
  }

  /**
   * Register a provider adapter
   */
  register(adapter: ProviderAdapter, info: ProviderInfo): void {
    this.providers.set(adapter.name, adapter)
    this.providerInfo.set(adapter.name, info)
    console.log(`[ProviderRegistry] Registered provider: ${adapter.name}`)
  }

  /**
   * Get a provider by name
   */
  get(name?: string): ProviderAdapter | undefined {
    const providerName = name || this.defaultProvider
    return this.providers.get(providerName)
  }

  /**
   * Get provider info by name
   */
  getInfo(name?: string): ProviderInfo | undefined {
    const providerName = name || this.defaultProvider
    return this.providerInfo.get(providerName)
  }

  /**
   * Get default provider
   */
  getDefault(): ProviderAdapter {
    const provider = this.providers.get(this.defaultProvider)
    if (!provider) {
      throw new Error(`Default provider '${this.defaultProvider}' not found`)
    }
    return provider
  }

  /**
   * Set default provider
   */
  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider '${name}' not registered`)
    }
    this.defaultProvider = name
  }

  /**
   * Check if a provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name)
  }

  /**
   * Deregister a provider by name. Built-in providers cannot be deregistered.
   */
  deregister(name: string): void {
    if (name === 'claude') return // built-in, never remove
    this.providers.delete(name)
    this.providerInfo.delete(name)
    console.log(`[ProviderRegistry] Deregistered provider: ${name}`)
  }

  /**
   * Get all registered provider names
   */
  getNames(): string[] {
    return Array.from(this.providers.keys())
  }

  /**
   * Get all provider info
   */
  getAllInfo(): ProviderInfo[] {
    return Array.from(this.providerInfo.values())
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry()

// Note: claudeProvider is already exported from './claudeProvider'
// Types are already exported from './types'
// Import them directly from those files to avoid duplicate export warnings
