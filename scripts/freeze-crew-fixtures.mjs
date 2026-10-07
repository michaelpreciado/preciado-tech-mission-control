/** Materialize synthetic envelopes for schema and native QML checks. */
import fs from 'node:fs'
import { projectCrew } from '../lib/pt/crew.ts'
import { crewEnvelope, deniedCrewEnvelope } from '../lib/pt/crew-read.ts'
import { displaySnapshot } from '../../desktop/mp.preciadoTech.crew/collector.mjs'
const fixture=JSON.parse(fs.readFileSync('tests/pt-parity/crew.json','utf8'))
const now=fixture.evaluatedAt
const source={id:'fixture',revision:'crew-fixture-v1',sourceAt:null,observedAt:now,lastSuccessAt:now,freshness:'fresh',blocked:false,reason:null}
const envelopes=fixture.cases.map(row=>({id:row.id,envelope:crewEnvelope(projectCrew(row.input,now),[source],now)}))
envelopes.push({id:'denied-auth',envelope:deniedCrewEnvelope(now)})
fs.writeFileSync('tests/pt-parity/crew-envelopes.json',JSON.stringify(envelopes,null,2)+'\n')
const snapshot=displaySnapshot(envelopes[0].envelope,Date.parse(now))
fs.writeFileSync('../desktop/mp.preciadoTech.crew/Smoke.qml',`import QtQuick
import Quickshell
import "."
Scope {
 FloatingWindow {
 implicitWidth: 700; implicitHeight: 100; visible: true
 BarWidget { id: widget; collectorEnabled: false; snapshot: ${JSON.stringify(snapshot)}; width: implicitWidth; height: implicitHeight }
 Timer { interval: 150; running: true; onTriggered: {
   widget.open(); if (!widget.opened || widget.height !== 26 || widget.snapshot.rows.length !== 4) throw new Error("Crew panel contract failed");
   console.log("CREW_QML_OPEN_ROWS_PASS"); widget.close(); widget.bar = {vertical:true,barSize:28,position:"left"};
   if (widget.implicitWidth !== 38 || widget.implicitHeight !== 28 || widget.snapshot.compactText !== "1/0") throw new Error("Crew vertical fit failed");
   console.log("CREW_QML_VERTICAL_PASS");
 } }
 Timer { interval: 400; running: true; onTriggered: Qt.quit() }
 }
}
`)
