import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { FONT_FAMILY } from '@/lib/fonts'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* Set on html/body so everything, including portals, picks up the site font. */}
      <style jsx global>{`
        html, body { font-family: ${FONT_FAMILY}; }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}
