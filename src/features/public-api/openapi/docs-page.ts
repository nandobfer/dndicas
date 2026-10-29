import { PUBLIC_API_SPEC_PATH } from "@/lib/public-api/paths"

/** Versão fixa do `swagger-ui-dist` servido por CDN. */
export const SWAGGER_UI_VERSION = "5.17.14"

const CDN = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}`

/**
 * Página Swagger UI da API dndicas. O `url:` literal do `SwaggerUIBundle` também é o que
 * o explorador de integrações procura para localizar a especificação a partir desta página.
 */
export function renderPublicApiDocsHtml(specPath: string = PUBLIC_API_SPEC_PATH): string {
    // Literal JS seguro dentro de <script> e texto seguro em HTML.
    const jsSpecPath = JSON.stringify(specPath).replace(/</g, "\\u003c")
    const htmlSpecPath = specPath.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>API dndicas — Documentação</title>
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" />
  <style>body { margin: 0; background: #fafafa; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <noscript>Ative o JavaScript para ver a documentação ou acesse <a href="${htmlSpecPath}">${htmlSpecPath}</a>.</noscript>
  <script src="${CDN}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${jsSpecPath},
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: false,
      tryItOutEnabled: false,
    });
  </script>
</body>
</html>
`
}
