# marct.co — site da agência

Leia o [README.md](./README.md): conceito, stack, mapa dos arquivos e o pipeline Blender → site.

- Texto e ordem das seções só em `src/content.ts`; a cena, o HTML e o fallback leem de lá.
- Bairro e texto monocromáticos (texto branco, tudo minúsculo, títulos em uma linha); cor só nos efeitos das animações (`ACCENT`).
- Lógica de scroll e câmera é pura (`src/timeline.ts`, `src/camera-path.ts`) e tem teste.
- A maquete sai de `blender/build_bairro.py`; preserve os nomes dos grupos, dos materiais `glass*` e das Actions.
- Deploy só pelo CI (job Deploy, push na main); nunca do notebook.
- UI: siga a skill **design-taste-frontend**.
- O CRM (histórico deste repositório) vive no branch `crm-revisional`; não misture.
