const NIPScheduleService = require('../server/services/NIPScheduleService');

const STATUS = NIPScheduleService.STATUS;

function test() {
    const today = new Date('2026-04-26');
    
    // Past date (Jan 13)
    const pastDate = new Date('2026-01-13');
    const pastStatus = NIPScheduleService.calculateStatus(pastDate, null, today);
    console.log(`Jan 13 (vs April 26): Expected OVERDUE, Got ${pastStatus}`);

    // Today
    const todayDate = new Date('2026-04-26');
    const todayStatus = NIPScheduleService.calculateStatus(todayDate, null, today);
    console.log(`April 26 (vs April 26): Expected DUE_TODAY, Got ${todayStatus}`);

    // Future (May 16)
    const futureDate = new Date('2026-05-16');
    const futureStatus = NIPScheduleService.calculateStatus(futureDate, null, today);
    console.log(`May 16 (vs April 26): Expected NOT_YET_DUE (Upcoming), Got ${futureStatus}`);

    // Soon (April 30)
    const soonDate = new Date('2026-04-30');
    const soonStatus = NIPScheduleService.calculateStatus(soonDate, null, today);
    console.log(`April 30 (vs April 26): Expected DUE_SOON, Got ${soonStatus}`);
}

test();
