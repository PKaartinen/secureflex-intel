/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "leaflet.heat" {
  // Side-effect import: adds heatLayer to L namespace
}

// Augment leaflet module to expose members that dynamic import loses
declare module "leaflet" {
  export function map(element: HTMLElement, options?: any): any;
  export function tileLayer(urlTemplate: string, options?: any): any;
  export function layerGroup(layers?: any[]): any;
  export function divIcon(options?: any): any;
  export function marker(latlng: [number, number], options?: any): any;
  export function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: any
  ): any;
  export class TileLayer {}
  export class Map {
    remove(): void;
    removeLayer(layer: any): this;
    eachLayer(fn: (layer: any) => void): this;
    addLayer(layer: any): this;
  }
  export class LayerGroup {
    addTo(map: any): this;
    clearLayers(): this;
  }
  export class Layer {
    addTo(map: any): this;
  }
}
