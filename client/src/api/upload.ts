import request from './request'

// 上传结果：url / key 必返，thumb / thumbSm 为 OSS 图片处理地址（换存储商时可能缺失）
export interface UploadedImage {
  url: string
  key: string
  thumb?: string
  thumbSm?: string
}

// 上传图片到阿里云 OSS（后端中转，返回可公开访问的 URL）
export const uploadImage = (file: File): Promise<UploadedImage> => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/upload', formData) as unknown as Promise<UploadedImage>
}
