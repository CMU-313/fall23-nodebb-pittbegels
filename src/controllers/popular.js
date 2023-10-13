"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = void 0;
const nconf_1 = __importDefault(require("nconf"));
const validator_1 = __importDefault(require("validator"));
const helpers_1 = __importDefault(require("./helpers"));
const recent_1 = require("./recent");
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const relative_path = nconf_1.default.get('relative_path');
// eslint-disable-next-line import/prefer-default-export
const get = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield (0, recent_1.getData)(req, 'popular', 'posts');
    if (!data) {
        return next();
    }
    const term = helpers_1.default.terms[req.query.term] || 'alltime';
    if (req.originalUrl.startsWith(`${relative_path}/api/popular`) || req.originalUrl.startsWith(`${relative_path}/popular`)) {
        data.title = `[[pages:popular-${term}]]`;
        const breadcrumbs = [{ text: '[[global:header.popular]]' }];
        data.breadcrumbs = helpers_1.default.buildBreadcrumbs(breadcrumbs);
    }
    const feedQs = data.rssFeedUrl.split('?')[1];
    data.rssFeedUrl = `${relative_path}/popular/${validator_1.default.escape(String(req.query.term || 'alltime'))}.rss`;
    if (req.loggedIn) {
        data.rssFeedUrl += `?${feedQs}`;
    }

    data.topics = data.topics.map((topic) => {
        topic.user.isInstructor = topic.user.accounttype === 'instructor';
        return topic;
    });

    res.render('popular', data);
});
exports.get = get;
