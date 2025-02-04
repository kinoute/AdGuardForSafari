const listeners = require('../../notifier');
const events = require('../../events');
const settings = require('../settings-manager');
const antibanner = require('../antibanner');
const {jsonFromFilters} = require('../libs/JSConverter');
const whitelist = require('../whitelist');
const log = require('../utils/log');
const concurrent = require('../utils/concurrent');

/**
 * Safari Content Blocker Adapter
 *
 * @type {{updateContentBlocker}}
 */
module.exports = (function () {

    const RULES_LIMIT = 50000;
    const DEBOUNCE_PERIOD = 500;

    const emptyBlockerJSON = [
        {
            "action": {
                "type": "ignore-previous-rules"
            },
            "trigger": {
                "url-filter": "none"
            }
        }
    ];

    /**
     * Load content blocker
     */
    const updateContentBlocker = () => {

        loadAndConvertRules(RULES_LIMIT, result => {

            if (!result) {
                clearFilters();
                listeners.notifyListeners(events.CONTENT_BLOCKER_UPDATED, {
                    rulesCount: 0,
                    rulesOverLimit: false,
                    advancedBlockingRulesCount: 0
                });

                return;
            }

            const json = JSON.parse(result.converted);
            const advancedBlocking = JSON.parse(result.advancedBlocking);
            setSafariContentBlocker(json, advancedBlocking);
            listeners.notifyListeners(events.CONTENT_BLOCKER_UPDATED, {
                rulesCount: json.length,
                rulesOverLimit: result.overLimit,
                advancedBlockingRulesCount: advancedBlocking.length
            });

        });
    };

    /**
     * Disables content blocker
     * @private
     */
    const clearFilters = () => {
        setSafariContentBlocker(emptyBlockerJSON);
    };

    /**
     * Load rules from requestFilter and WhiteListService and convert for ContentBlocker
     * @private
     */
    const loadAndConvertRules = concurrent.debounce((rulesLimit, callback) => {

        if (settings.isFilteringDisabled()) {
            log.info('Disabling content blocker.');
            callback(null);
            return;
        }

        log.info('Loading content blocker.');

        let rules = antibanner.getRules();

        log.info('Rules loaded: {0}', rules.length);
        if (settings.isDefaultWhiteListMode()) {
            rules = rules.concat(whitelist.getRules());
        } else {
            const invertedWhitelistRule = constructInvertedWhitelistRule();
            if (invertedWhitelistRule) {
                rules = rules.concat(invertedWhitelistRule);
            }
        }

        const result = jsonFromFilters(rules, rulesLimit, false, true);
        if (result && result.converted) {
            callback(result);
        } else {
            callback(null);
        }

    }, DEBOUNCE_PERIOD);

    /**
     * Activates content blocker json
     *
     * @param contentBlocker json
     * @param advancedBlocking json
     */
    const setSafariContentBlocker = (contentBlocker, advancedBlocking) => {
        try {
            log.info(`Setting content blocker. Length=${contentBlocker.length}; Advanced Blocking Length=${advancedBlocking.length}`);

            listeners.notifyListeners(events.CONTENT_BLOCKER_UPDATE_REQUIRED, {
                contentBlocker,
                advancedBlocking
            });

            log.info('Content blocker has been set.');
        } catch (ex) {
            log.error('Error while setting content blocker: ' + ex);
        }
    };

    /**
     * Constructs rule for inverted whitelist
     *
     * @private
     */
    const constructInvertedWhitelistRule = () => {
        const domains = whitelist.getWhiteListDomains();
        let invertedWhitelistRule = '@@||*$document';
        if (domains && domains.length > 0) {
            invertedWhitelistRule += ",domain=";
            let i = 0;
            const len = domains.length;
            for (; i < len; i++) {
                if (i > 0) {
                    invertedWhitelistRule += '|';
                }

                invertedWhitelistRule += '~' + domains[i];
            }
        }

        return invertedWhitelistRule;
    };

    return {
        updateContentBlocker: updateContentBlocker,
        setSafariContentBlocker: setSafariContentBlocker
    };

})();

