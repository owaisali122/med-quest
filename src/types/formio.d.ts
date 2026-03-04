declare module 'formiojs' {
  export const Formio: {
    FormBuilder: new (
      element: HTMLElement,
      schema: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => { ready: Promise<unknown>; destroy: () => void }
    createForm: (
      element: HTMLElement,
      schema: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<unknown>
    Components: {
      setComponent: (type: string, component: unknown) => void
      components: Record<string, unknown>
    }
  }
}
