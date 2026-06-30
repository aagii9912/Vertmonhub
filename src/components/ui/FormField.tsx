"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * FormField — нэг удирдлагыг (input/select/textarea г.м.) шошго, тайлбар, алдааны
 * мессежтэй нь хамт стандарт хэлбэрт оруулна. Энэ нь олон газар давтагдсан
 * `label + control + hint + error` хэв маягийг нэг компонент болгож нэгтгэдэг.
 *
 * Хүртээмж (a11y):
 * - `htmlFor`-г дамжуулбал шошго болон удирдлага автоматаар холбогдоно.
 * - Алдаа гарсан үед дотор хадгалагдсан `error` нь `role="alert"`-тэй гарна.
 * - Удирдлага дээрээ дараахыг гараар нэмж өгнө үү (FormField зөвхөн зөвлөмж өгдөг,
 *   автоматаар утга шахдаггүй):
 *     `aria-invalid={!!error}`
 *     `aria-describedby` нь алдааны элементийн id руу заана (доорх `errorId`/`hintId`
 *      хэв маягийг ашиглах боломжтой).
 */
type FormFieldProps = {
  /** Шошгоны текст (Монголоор). */
  label?: React.ReactNode
  /** Удирдлагын `id`. Өгвөл шошготой холбогдоно. */
  htmlFor?: string
  /** Туслах тайлбар (алдаа байхгүй үед харагдана). */
  hint?: React.ReactNode
  /** Алдааны мессеж. Өгвөл `role="alert"`-тэй харагдана. */
  error?: React.ReactNode
  /** Заавал бөглөх талбар — шошгонд улбар шар одтой тэмдэг нэмнэ. */
  required?: boolean
  /** Удирдлагын элемент. */
  children: React.ReactNode
  className?: string
}

function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined
  const errorId = htmlFor ? `${htmlFor}-error` : undefined

  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <LabelPrimitive.Root
          data-slot="form-field-label"
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-sm leading-none font-medium text-foreground select-none"
        >
          <span>{label}</span>
          {required ? (
            <span
              aria-hidden="true"
              className="text-brand-strong"
              data-slot="form-field-required"
            >
              *<span className="sr-only">(заавал)</span>
            </span>
          ) : null}
        </LabelPrimitive.Root>
      ) : null}

      {children}

      {error ? (
        <p
          id={errorId}
          role="alert"
          data-slot="form-field-error"
          className="text-xs text-status-danger"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={hintId}
          data-slot="form-field-hint"
          className="text-xs text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * FieldGroup — талбаруудыг тогтмол босоо зайтай давхарлах сав.
 * Жишээ: формын олон FormField-ийг нэг доор эгнүүлэх.
 */
function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

/**
 * FieldRow — тохиргооны маягийн формд зориулсан 2 баганат хариу үзүүлэх мөр:
 * гар утсан дээр босоо давхарласан, md дээр шошго зүүн талд, удирдлага баруун талд.
 *
 * Эхний хүүхэд (шошго/тайлбар хэсэг) болон үлдсэн хүүхдүүд (удирдлага) гэсэн 2 хэсэгт
 * хуваагдана. Шошгоны хэсэгт `FormField`-ийн оронд гарчиг + тайлбар бичиж болно.
 */
type FieldRowProps = React.ComponentProps<"div"> & {
  /** Зүүн талын шошго/тайлбар хэсэг. */
  label: React.ReactNode
  /** md дээр шошгоны баганад өгөх өргөн (Tailwind grid template-д тохирно). */
  labelClassName?: string
}

function FieldRow({
  label,
  labelClassName,
  className,
  children,
  ...props
}: FieldRowProps) {
  return (
    <div
      data-slot="field-row"
      className={cn(
        "grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-start md:gap-6",
        className
      )}
      {...props}
    >
      <div
        data-slot="field-row-label"
        className={cn(
          "flex flex-col gap-0.5 text-sm font-medium text-foreground md:pt-2",
          labelClassName
        )}
      >
        {label}
      </div>
      <div data-slot="field-row-control" className="flex flex-col gap-1.5">
        {children}
      </div>
    </div>
  )
}

export { FormField, FieldGroup, FieldRow }
