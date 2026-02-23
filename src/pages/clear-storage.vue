<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isClearing = ref(true)
const message = ref('Clearing storage...')

onMounted(() => {
  setTimeout(() => {
    // LocalStorage se dummy data clear karo
    localStorage.removeItem('api_tokens')

    isClearing.value = false
    message.value = 'Storage cleared successfully!'

    // 2 seconds ke baad home page pe redirect
    setTimeout(() => {
      router.push('/')
    }, 2000)
  }, 1000)
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
      <div v-if="isClearing" class="flex flex-col items-center gap-4">
        <svg class="w-16 h-16 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ message }}</h2>
      </div>

      <div v-else class="flex flex-col items-center gap-4">
        <svg class="w-16 h-16 text-green-600" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
          <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M9 12l2 2 4-4"/>
        </svg>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ message }}</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">Redirecting to home page...</p>
      </div>
    </div>
  </div>
</template>
