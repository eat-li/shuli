<template>
  <node-view-wrapper class="re-img-row">
    <node-view-content class="re-img-row__content" />
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from '@tiptap/vue-3'

defineProps(nodeViewProps)
</script>
