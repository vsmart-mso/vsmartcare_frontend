export interface AinuEkycCredential {
  accountId: string
  accountSecret: string
}

export interface AinuEkycDelegate {
  onLoaded?: () => void
  onReady?: (transactionId: string) => void
  onEkycResult?: (result: unknown) => void
}

export interface AinuEkycConfigs {
  containerId: string
  credential: AinuEkycCredential
  flowId: string
  language: string
  delegate?: AinuEkycDelegate
}

export interface AinuEkycApi {
  setup: (configs: AinuEkycConfigs) => void
  start: (refId: string) => Promise<void>
  close: () => void
}

declare global {
  interface Window {
    AinuEkyc: AinuEkycApi
  }
}

export {}
