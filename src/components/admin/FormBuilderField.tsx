'use client'

import { useField } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BootstrapProvider,
  getBuilderConfig,
  registerCustomComponents,
  setupAppDetailRefFormDropdown,
} from 'formIoBuilder'
import { getFormsListUrl } from '@/config/formio'
import type { DisplayType, FormioBuilderInstance, FormioSchema } from '@/types/formio-builder'

import styles from './FormBuilderField.module.scss'

const DEFAULT_SCHEMA: FormioSchema = {
  display: 'form',
  components: [],
}

function cloneSchema(schema: FormioSchema): FormioSchema {
  return JSON.parse(JSON.stringify(schema))
}

function FormBuilderField() {
  const { value, setValue } = useField<FormioSchema>()
  const containerRef = useRef<HTMLDivElement>(null)
  const builderInstanceRef = useRef<FormioBuilderInstance | null>(null)
  const [packageError, setPackageError] = useState<string | null>(null)
  const [builderReady, setBuilderReady] = useState(false)
  const [containerReady, setContainerReady] = useState(false)
  const valueRef = useRef(value)
  valueRef.current = value

  const displayType = useMemo<DisplayType>(() => {
    const v = value
    if (v?.display === 'wizard' || v?.display === 'form') return v.display
    return 'form'
  }, [value?.display])

  // Set default value only when truly empty (new form)
  useEffect(() => {
    if (value == null) {
      setValue(DEFAULT_SCHEMA)
    }
  }, [value, setValue])

  const initBuilder = useCallback(
    async (overrideSchema?: FormioSchema) => {
      if (!containerRef.current) return

      const formsListUrl = getFormsListUrl()
      await registerCustomComponents({ formsListUrl })
      const win = typeof window !== 'undefined' ? (window as unknown as { Formio?: { FormBuilder?: new (el: HTMLElement, s: FormioSchema, o: Record<string, unknown>) => { ready: Promise<FormioBuilderInstance> } } }) : undefined
      const FormBuilderClass = win?.Formio?.FormBuilder
      if (!FormBuilderClass) {
        setPackageError('formiojs could not be loaded.')
        return
      }

      if (builderInstanceRef.current?.destroy) {
        try {
          builderInstanceRef.current.destroy()
        } catch (_) {}
        builderInstanceRef.current = null
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }

      const currentValue = valueRef.current
      const initialSchema: FormioSchema =
        overrideSchema ??
        (currentValue && typeof currentValue === 'object' && Array.isArray((currentValue as FormioSchema).components)
          ? (currentValue as FormioSchema)
          : DEFAULT_SCHEMA)

      const schemaWithDisplay = cloneSchema(initialSchema)
      if (schemaWithDisplay.display !== 'form' && schemaWithDisplay.display !== 'wizard') {
        schemaWithDisplay.display = 'form'
      }

      const builderConfig = getBuilderConfig({ template: 'bootstrap' })
      const formBuilder = new FormBuilderClass(containerRef.current, schemaWithDisplay, builderConfig)
      const instance = (await formBuilder.ready) as FormioBuilderInstance
      builderInstanceRef.current = instance
      setupAppDetailRefFormDropdown(instance as unknown as Record<string, unknown>)

      const getSchemaFromInstance = (): FormioSchema | null => {
        try {
          const inst = builderInstanceRef.current
          if (!inst) return null
          const form = inst.form
          if (form && typeof form === 'object' && Array.isArray(form.components)) {
            return { ...form, display: schemaWithDisplay.display } as FormioSchema
          }
          if (inst.schema && typeof inst.schema === 'object') {
            return inst.schema as FormioSchema
          }
          return null
        } catch {
          return null
        }
      }

      const syncSchemaToField = (schema: FormioSchema | null) => {
        if (!schema || typeof schema !== 'object') return
        const comps = schema.components
        if (!Array.isArray(comps)) return
        const withDisplay = schema.display ? schema : { ...schema, display: schemaWithDisplay.display }
        setValue(cloneSchema(withDisplay))
      }

      // Initial sync after ready (e.g. Wizard adds first page but may not emit 'change')
      const schemaToSave = getSchemaFromInstance()
      if (schemaToSave && Array.isArray(schemaToSave.components)) {
        syncSchemaToField(schemaToSave)
      }

      instance.on?.('change', (schema: FormioSchema) => {
        if (schema && typeof schema === 'object') syncSchemaToField(schema)
      })

      instance.on?.('saveComponent', () => {
        queueMicrotask(() => {
          const s = getSchemaFromInstance()
          if (s) syncSchemaToField(s)
        })
      })

      const syncAfterChange = () => {
        queueMicrotask(() => {
          const s = getSchemaFromInstance()
          if (s) syncSchemaToField(s)
        })
      }
      instance.on?.('addComponent', syncAfterChange)
      instance.on?.('removeComponent', syncAfterChange)
      instance.on?.('updateComponent', syncAfterChange)

      setPackageError(null)
      setBuilderReady(true)
    },
    [setValue],
  )

  useEffect(() => {
    if (!containerReady) return
    initBuilder()
    return () => {
      if (builderInstanceRef.current?.destroy) {
        try {
          builderInstanceRef.current.destroy()
        } catch (_) {}
        builderInstanceRef.current = null
      }
    }
  }, [containerReady, initBuilder])

  const handleDisplayChange = useCallback(
    (newDisplay: DisplayType) => {
      const currentSchema =
        value && typeof value === 'object' && Array.isArray((value as FormioSchema).components)
          ? cloneSchema(value as FormioSchema)
          : cloneSchema(DEFAULT_SCHEMA)
      currentSchema.display = newDisplay
      if (newDisplay === 'wizard' && (!currentSchema.components || currentSchema.components.length === 0)) {
        currentSchema.components = [{ type: 'panel', title: 'Page 1', components: [] }]
      }
      setValue(currentSchema)
      if (builderInstanceRef.current?.destroy) {
        try {
          builderInstanceRef.current.destroy()
        } catch (_) {}
        builderInstanceRef.current = null
      }
      setBuilderReady(false)
      initBuilder(currentSchema)
    },
    [value, setValue, initBuilder],
  )

  return (
    <BootstrapProvider>
      <div className={styles.wrapper}>
        <div className={styles.toolbar}>
          <label className={styles.label}>Display as:</label>
          <select
            className={styles.select}
            value={displayType}
            onChange={(e) => handleDisplayChange(e.target.value as DisplayType)}
          >
            <option value="form">Form</option>
            <option value="wizard">Wizard</option>
          </select>
        </div>
        {packageError && <div className={styles.error}>{packageError}</div>}
        {!packageError && (
          <div
            ref={(el) => {
              (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
              if (el) setContainerReady(true)
            }}
            className={styles.builder}
          />
        )}
        {!packageError && !builderReady && <div className={styles.loading}>Loading builder…</div>}
      </div>
    </BootstrapProvider>
  )
}

export default FormBuilderField
