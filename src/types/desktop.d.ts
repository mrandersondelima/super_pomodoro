export {}

declare global {
  interface Window {
    desktop?: {
      showNotification: (payload: { title: string; body: string }) => Promise<boolean>
    }
  }
}
