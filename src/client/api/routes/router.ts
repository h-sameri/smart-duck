import { Hono } from "hono";
import example from "./example";
import evm from "./evm";

const routes = new Hono()
    .route("/example", example)
    .route("/evm", evm)

export default routes;