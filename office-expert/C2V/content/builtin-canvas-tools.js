(() => {
  'use strict';

  const registry = globalThis.__gtMapperCanvasToolRegistryV1;
  if (!registry) throw new Error('画布工具注册中心未加载');
  const harness = globalThis.__annotationHarnessV1;
  if (!harness) throw new Error('标注 Harness 未加载');
  const catalog = globalThis.__annotationHarnessBlockCatalogV1;
  if (!Array.isArray(catalog)) throw new Error('积木目录未加载');
  catalog.forEach((block) => harness.registerBlock({
    ...block,
    isReady: () => block.readyGlobals.every((key) => Boolean(globalThis[key]))
  }));

  function lazyTool(blockId, context, factory) {
    return harness.createLazyTool({ blockId, context, factory });
  }

  catalog.forEach((block) => registry.register({
    id: block.id,
    title: block.tool.title,
    description: block.description,
    badge: block.tool.badge,
    keywords: block.tool.keywords,
    defaultWidth: block.tool.defaultWidth,
    defaultHeight: block.tool.defaultHeight,
    minimumWidth: block.tool.minimumWidth,
    minimumHeight: block.tool.minimumHeight,
    autoHeight: block.tool.autoHeight,
    manifest: block,
    create(context) {
      return lazyTool(block.id, context, (loadedContext) => {
        const Workbench = globalThis[block.factoryGlobal];
        if (!Workbench) {
          throw new Error(`${block.name}工作台未完成装配`);
        }
        return new Workbench(loadedContext);
      });
    }
  }));
})();
