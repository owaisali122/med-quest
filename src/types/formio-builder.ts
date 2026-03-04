export type DisplayType = 'form' | 'wizard'

export interface FormioSchema {
  display?: DisplayType
  components?: unknown[]
  [key: string]: unknown
}

/** Inner builder instance (WizardBuilder / WebformBuilder) from formBuilder.ready */
export interface FormioBuilderInstance {
  form?: { display?: string; components?: unknown[] }
  schema?: FormioSchema
  on?(event: string, fn: (schema: FormioSchema) => void): void
  destroy?(): void
}
