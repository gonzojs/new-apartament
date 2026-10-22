import { searchCatalog, getCatalogProduct } from "./catalog.js";
export const config = {
  id: "nooma",
  name: "noo.ma",
  host: "noo.ma",
  type: "shopify",
  search: true,
  import_link: true,
  external: "https://noo.ma/search?q=",
  method: "Shopify JSON",
};
export const search = (query) => searchCatalog(config, query);
export const getProduct = (url) => getCatalogProduct(config, url);
