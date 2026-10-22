import { searchCatalog, getCatalogProduct } from "./catalog.js";
export const config = {
  id: "sklum",
  name: "Sklum",
  host: "www.sklum.com",
  type: "empathy",
  search: true,
  import_link: true,
  external: "https://www.sklum.com/es/buscar?query=",
  method: "Empathy API",
};
export const search = (query) => searchCatalog(config, query);
export const getProduct = (url) => getCatalogProduct(config, url);
