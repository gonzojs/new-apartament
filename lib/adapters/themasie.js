import { searchCatalog, getCatalogProduct } from "./catalog.js";
export const config = {
  id: "themasie",
  name: "The Masie",
  host: "www.themasie.com",
  type: "empathy",
  search: true,
  import_link: true,
  external: "https://www.themasie.com/es/buscar?query=",
  method: "Empathy API",
};
export const search = (query) => searchCatalog(config, query);
export const getProduct = (url) => getCatalogProduct(config, url);
