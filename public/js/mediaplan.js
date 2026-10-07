/* Media planner: retired from this page. Plans are now built in the Media module (/media/plans), which combines the
   online plan, the OOH inventory with real rates, versions and locking, and the agency-format Excel and PDF. */
(function () {
'use strict';
const { I } = PI;
PI.tools.mediaplan = box => {
  if (PI.S && PI.S.openPlan) PI.S.openPlan = null;
  box.innerHTML = `<div class="band-h" style="margin-top:10px"><h2 style="font-size:34px">The Media planner has moved</h2><p>Online, OOH and hybrid plans are now built in one place, with the real inventory and rates, versions, approvals and the agency-format Excel and PDF.</p></div>
    <div class="actions" style="justify-content:center;margin-top:20px"><a class="btn pri" href="/media/plans/new">${I('plus')}New plan</a><a class="btn" href="/media/plans">${I('calendar-clock')}All plans</a></div>`;
  setTimeout(() => { if (location.hash.startsWith('#/p/media/plan')) location.href = '/media/plans'; }, 1200);
};
})();
