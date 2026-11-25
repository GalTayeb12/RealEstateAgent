# Asset licenses

Allowed: CC0 (Poly Haven, ambientCG), original HAVENIQ assets, CC-BY (attribution stored in manifest). Excluded: NC/ND, store-licensed models, BlendKit Royalty-Free (extractable GLB redistribution unclear). Meshy and other paid sources need explicit approval.

Poly Haven API: unique User-Agent, visible "Powered by Poly Haven" credit if the live API is used (we prefer a one-time download).

| Asset id | Version | Source URL | Author | SPDX | Attribution | Retrieved |
|---|---|---|---|---|---|---|
| sofa-03, armchair-modern-01, coffee-table-modern-01, side-table-01 | 1 | https://polyhaven.com/models | Poly Haven contributors | CC0-1.0 | none required (credit appreciated) | 2026-11-25 |
| WoodFloor062 -> parquet-oak-light | 1 | https://ambientcg.com/view?id=WoodFloor062 | ambientCG | CC0-1.0 | none required | 2026-11-25 |
| Plaster001 -> plaster-limewash-soft | 1 | https://ambientcg.com/view?id=Plaster001 | ambientCG | CC0-1.0 | none required | 2026-11-25 |
| Travertine009 -> travertine-cream | 1 | https://ambientcg.com/view?id=Travertine009 | ambientCG | CC0-1.0 | none required | 2026-11-25 |
| Fabric086 -> fabric-textured-stone | 1 | https://ambientcg.com/view?id=Fabric086 | ambientCG | CC0-1.0 | none required | 2026-11-25 |
| Concrete034 -> microcement-light | 1 | https://ambientcg.com/view?id=Concrete034 | ambientCG | CC0-1.0 | none required | 2026-11-25 |
| sofa-modular-01, coffee-drum-01, side-drum-01 | 1 | original (scripts/blender/studio_sofa.py, studio_tables.py) | HAVENIQ | HAVENIQ-ORIGINAL | - | 2026-11-25 |

Notes: ambientCG assets were downloaded once through its public API (one request per asset, descriptive User-Agent), 2026-11-25; the files are CC0 (https://docs.ambientcg.com/license/), only image files were extracted, and the packed textures are colour-graded copies (parquet and plaster). The ambientCG API is run by one person and is not meant for enterprise-level runtime use, so the studio never calls it at runtime.
