import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style dangerouslySetInnerHTML={{ __html: `
          * { cursor: default; }
          a[href], button, select, label,
          input[type="checkbox"], input[type="radio"],
          [role="button"] { cursor: pointer; }
          input[type="text"], input[type="search"],
          input[type="number"], textarea { cursor: text; }
        `}} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
