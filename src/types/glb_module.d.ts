/** Vite asset URL imports for binary glTF character models. */
declare module '*.glb' {
  const assetUrl: string;
  export default assetUrl;
}

declare module '*.glb?url' {
  const assetUrl: string;
  export default assetUrl;
}
