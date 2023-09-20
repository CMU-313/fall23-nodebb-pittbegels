import winston = require('winston');
import cron = require('cron');
import db = require('../database');
import meta = require('../meta');

interface CJobType {
    stop? : () => void;
}

interface JobsType {
    [name : string] : CJobType;
}

interface ResetType{
    clean?:string;
}

interface DigestType{
    execute?: (interval) => void;
}

interface UserType{
    startJobs ?: () => void;
    stopJobs ?: () => void;
    reset ?: ResetType;
    digest ?: DigestType;
}

const jobs = {} as JobsType;

module.exports = function (User:UserType) {
    function startDigestJob(name:string, cronString, term:string) {
        /* eslint-disable-next-line
            @typescript-eslint/no-unsafe-member-access,
            @typescript-eslint/no-unsafe-call,
            @typescript-eslint/no-unsafe-assignment */
        jobs[name] = new cron.CronJob(cronString, (async () => {
            winston.verbose(`[user/jobs] Digest job (${name}) started.`);
            try {
                if (name === 'digest.weekly') {
                    /* eslint-disable-next-line
                        @typescript-eslint/no-unsafe-member-access,
                        @typescript-eslint/no-unsafe-call,
                        @typescript-eslint/no-unsafe-assignment */
                    const counter = await db.increment('biweeklydigestcounter');
                    if (counter % 2) {
                        User.digest.execute({ interval: 'biweek' });
                    }
                }
                User.digest.execute({ interval: term });
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                winston.error(err.stack);
            }
        }), null, true);
        winston.verbose(`[user/jobs] Starting job (${name})`);
    }
    User.startJobs = function () {
        winston.verbose('[user/jobs] (Re-)starting jobs...');

        let digestHour = meta.config as number;

        // Fix digest hour if invalid
        if (isNaN(digestHour)) {
            digestHour = 17;
        } else if (digestHour > 23 || digestHour < 0) {
            digestHour = 0;
        }

        User.stopJobs();

        startDigestJob('digest.daily', `0 ${digestHour} * * *`, 'day');
        startDigestJob('digest.weekly', `0 ${digestHour} * * 0`, 'week');
        startDigestJob('digest.monthly', `0 ${digestHour} 1 * *`, 'month');

        /* eslint-disable-next-line
            @typescript-eslint/no-unsafe-member-access,
            @typescript-eslint/no-unsafe-call,
            @typescript-eslint/no-unsafe-assignment */
        jobs['reset.clean'] = new cron.CronJob('0 0 * * *', User.reset.clean, null, true);
        winston.verbose('[user/jobs] Starting job (reset.clean)');

        winston.verbose(`[user/jobs] jobs started`);
    };

    User.stopJobs = function () {
        let terminated = 0;
        // Terminate any active cron jobs
        for (const jobId of Object.keys(jobs)) {
            winston.verbose(`[user/jobs] Terminating job (${jobId})`);
            jobs[jobId].stop();
            delete jobs[jobId];
            terminated += 1;
        }
        if (terminated > 0) {
            winston.verbose(`[user/jobs] ${terminated} jobs terminated`);
        }
    };
};
