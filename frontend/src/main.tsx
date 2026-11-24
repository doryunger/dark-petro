import { render } from "@solidjs/web";
import "mapbox-gl/dist/mapbox-gl.css";
import "./styles/app.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("root element is missing");

render(() => <App />, root);
