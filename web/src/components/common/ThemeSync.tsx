import { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'

/** 将主题同步到 <html data-theme="..."> */
export default function ThemeSync() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return null
}
