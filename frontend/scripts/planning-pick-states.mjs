import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const source = fs.readFileSync(new URL("../src/planningModel.js", import.meta.url), "utf8");
const compiled = path.join(os.tmpdir(), "planning-model-for-pick-test.mjs");
fs.writeFileSync(compiled, source);
const {
  applyChainagePick,
  beginChainagePick,
  cancelChainagePick,
  createInitialPlanning,
  planningModalVisible,
  selectPlanningProject,
  setPlanningEditor
} = await import(pathToFileURL(compiled).href);

function fail(message) {
  throw new Error(message);
}

const initial = createInitialPlanning();
const project = initial.projects[0];
const site = project.sites[0];
if (!planningModalVisible(initial)) fail("editor should be open before a pick");

const started = beginChainagePick(initial, {
  projectId: project.id,
  siteId: site.id,
  field: "chainageFrom"
});
if (started === initial) fail("a first pick should start");
if (planningModalVisible(started)) fail("pick-in-progress still shows the modal");
if (started.pick.field !== "chainageFrom") fail("start pick did not record chainageFrom");

const second = beginChainagePick(started, {
  projectId: project.id,
  siteId: site.id,
  field: "chainageTo"
});
if (second !== started) fail("a second pick can start");
if (second.pick.field !== "chainageFrom") fail("a second pick replaced the field");

const otherProject = selectPlanningProject(started, "someone-else");
if (otherProject !== started) fail("sidebar project change started another pick");
const editor = setPlanningEditor(started, false);
if (editor !== started) fail("sidebar editor click changed a pick in progress");

const ignored = applyChainagePick(started, { Latitude: -27, Longitude: 153 });
if (ignored !== started) fail("a click that is not a chainage point changed the pick");
if (planningModalVisible(ignored)) fail("a non-chainage click showed the modal");

const point = {
  Tdist_Start: 12.5,
  Road_Section_Id: "1000",
  Carriageway_Code: "1",
  Description: "1000_1|EAST COAST ROAD"
};
const done = applyChainagePick(started, point);
if (done.pick !== null) fail("choosing a point started another pick");
if (!planningModalVisible(done)) fail("the editor modal did not return after the point");
if (done.projects[0].sites[0].chainageFrom !== "12.5") fail("chainage was not filled");
if (done.projects[0].sites[0].chainageTo !== "") fail("finish chainage was filled by the start pick");

const again = beginChainagePick(done, {
  projectId: done.projects[0].id,
  siteId: done.projects[0].sites[0].id,
  field: "chainageTo"
});
if (planningModalVisible(again)) fail("the next pick still shows the modal");
const finished = applyChainagePick(again, { ...point, Tdist_Start: 14 });
if (finished.pick !== null || !planningModalVisible(finished)) fail("finish pick did not return a single modal");
if (finished.projects[0].sites[0].chainageTo !== "14") fail("finish chainage was not filled");

const cancelled = cancelChainagePick(again);
if (cancelled.pick !== null || !planningModalVisible(cancelled)) fail("cancel did not return the modal");

const view = fs.readFileSync(new URL("../src/PlanningView.js", import.meta.url), "utf8");
if (view.includes("is-loading")) fail("planning map uses the blocking loading overlay");
if (!view.includes("acceptPickRef")) fail("map clicks are not guarded against a second pick");

const sidebar = fs.readFileSync(new URL("../src/components/PlanningSidebar.js", import.meta.url), "utf8");
if (!sidebar.includes("planningModalVisible")) fail("the editor is not gated on the pick state");
if (sidebar.includes("planning-modal") && sidebar.includes("is-loading")) fail("editor modal blocks the map");

console.log("planning pick states ok");
