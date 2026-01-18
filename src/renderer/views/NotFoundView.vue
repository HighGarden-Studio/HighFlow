<script setup lang="ts">
/**
 * Not Found View
 *
 * 404 page
 */
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center h-full bg-gray-900">
    <div class="text-center">
      <h1 class="text-9xl font-bold text-gray-700">404</h1>
      <h2 class="text-2xl font-semibold text-white mt-4">Page Not Found</h2>
      <p class="text-gray-400 mt-2 mb-8">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div class="flex gap-4 justify-center">
        <button
          class="px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors"
          @click="router.back()"
        >
          Go Back
        </button>
        <button
          class="px-4 py-2 bg-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 transition-colors"
          @click="router.push('/projects')"
        >
          Go to Projects
        </button>
      </div>
    </div>
  </div>
</template>
