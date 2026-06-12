import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { welfareApi, type SubmissionEligibilityRead } from '@/api/welfare'

export const useEligibilityStore = defineStore('eligibility', () => {
  const data = ref<SubmissionEligibilityRead | null>(null)
  const personId = ref<number | null>(null)
  const loading = ref(false)

  const canAccessPortal = computed(() => data.value?.can_access_portal ?? true)
  const canSubmit = computed(() => data.value?.can_submit ?? true)
  const reason = computed(() => data.value?.reason ?? 'none')

  async function fetchEligibility(targetPersonId: number, force = false): Promise<SubmissionEligibilityRead> {
    if (
      !force
      && personId.value === targetPersonId
      && data.value !== null
    ) {
      return data.value
    }

    loading.value = true
    try {
      const result = await welfareApi.getSubmissionEligibility(targetPersonId)
      data.value = result
      personId.value = targetPersonId
      return result
    } finally {
      loading.value = false
    }
  }

  function clearEligibility() {
    data.value = null
    personId.value = null
  }

  return {
    data,
    personId,
    loading,
    canAccessPortal,
    canSubmit,
    reason,
    fetchEligibility,
    clearEligibility,
  }
})
