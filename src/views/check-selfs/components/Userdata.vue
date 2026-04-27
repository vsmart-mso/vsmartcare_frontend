<script setup lang="ts">
defineProps<{
    prefix: string
    firstname: string
    lastname: string
}>()
</script>

<template>
    <section class="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div class="flex flex-row items-left justify-left ml-2 gap-2">
            <p class="text-base font-semibold text-slate-500">สวัสดี</p>
            <p class="text-base font-semibold text-slate-900">
                {{ prefix }} {{ firstname }} {{ lastname }}
            </p>
        </div>
    </section>
  </template>
