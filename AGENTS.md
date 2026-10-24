# marct.co — site da agência

Leia o [README.md](./README.md): conceito, stack, mapa dos arquivos e o pipeline Blender → site.

- Texto e ordem das seções só em `src/content.ts`; a cena, o HTML e o fallback leem de lá.
- Monocromático: cinza e preto; branco puro só no logo, na luz da fachada ativa e no CTA.
- Lógica de scroll e câmera é pura (`src/timeline.ts`, `src/camera-path.ts`) e tem teste.
- Ao trocar o provisório pelo `.glb`, preserve os nomes dos grupos e das Actions.
- UI: siga a skill **design-taste-frontend**.
- O CRM (histórico deste repositório) vive no branch `crm-revisional`; não misture.
