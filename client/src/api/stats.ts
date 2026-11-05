import request from './request'

// 首页概览统计（题量、作业数、学生数、待办提醒等）。
export const getStats = () => request.get('/stats')
