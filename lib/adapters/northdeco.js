import { searchCatalog, getCatalogProduct } from "./catalog.js";
export const config = {
  id: "northdeco",
  name: "Northdeco",
  host: "northdeco.com",
  type: "shopify",
  search: true,
  import_link: true,
  external: "https://northdeco.com/search?q=",
  method: "Shopify JSON",
};
export const search = (query) => searchCatalog(config, query);
export const getProduct = (url) => getCatalogProduct(config, url);
