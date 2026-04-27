<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue?: string | number | null
    type?: 'text' | 'number'
    placeholder?: string
    helperText?: string
    errorText?: string
    readonly?: boolean
    disabled?: boolean
    inputmode?: 'text' | 'numeric' | 'decimal'
    autocomplete?: string
  }>(),
  {
    type: 'text',
    placeholder: '',
    helperText: undefined,
    errorText: undefined,
    readonly: false,
    disabled: false,
    inputmode: 'text',
    autocomplete: 'off'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: []
}>()

const hasValue = computed(() => {
  const v = props.modelValue
  if (v === null || v === undefined) return false
  return String(v).trim().length > 0
})

const showValid = computed(() => hasValue.value && !props.errorText && !props.disabled)
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="text-sm font-medium text-slate-900">
      {{ label }}
    </label>

    <div class="relative">
      <input
        :id="id"
        :type="type"
        class="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-blue-600/40 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        :class="[
          errorText ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-blue-300',
          readonly ? 'bg-slate-100 text-slate-700' : ''
        ]"
        :placeholder="placeholder"
        :readonly="readonly"
        :disabled="disabled"
        :inputmode="inputmode"
        :autocomplete="autocomplete"
        :aria-invalid="errorText ? 'true' : 'false'"
        :aria-describedby="helperText || errorText ? `${id}-help` : undefined"
        :value="modelValue ?? ''"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @blur="emit('blur')"
      />

      <svg
        v-if="showValid"
        viewBox="0 0 24 24"
        class="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5" />
      </svg>
    </div>

    <p v-if="errorText" :id="`${id}-help`" class="text-xs text-red-500">
      {{ errorText }}
    </p>
    <p v-else-if="helperText" :id="`${id}-help`" class="text-xs text-gray-500">
      {{ helperText }}
    </p>
  </div>
</template>

