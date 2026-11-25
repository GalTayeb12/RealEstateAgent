# Quality gates

## Asset gates (block publishing)
Dimensions within +-1 cm of spec; origin floor/back-centre; +Z forward; named material slots; UV density in range; triangle budget (hero <=1.5 MB GLB, decor <=400 KB); glTF validator 0 errors; thumbnail approved; license + style tags present; no primitive-box furniture; no visible faceting on curves; bevels present; upholstery has weave/normal detail.

## Visual review checklist (M4, M5, M8, M12; judged by eye on fixed-camera shots)
grounding and contact shadows; shell vs dynamic tone match; texture scale (1 m checker); silhouette smoothness; upholstery detail; exposure and white balance; composition. Pixel-diff is only a regression guard for unchanged pages.

## Performance budgets (label each number "measured (device)" or "estimated (emulation)")
Desktop High >=60 fps; mid mobile Low >=30 fps; furnished scene <=1.2M tris desktop / <=500k mobile; <=350 / <=200 draw calls; first load <=8 MB mobile.

## Results log
(empty)
