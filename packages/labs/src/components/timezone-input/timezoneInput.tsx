/*
 * Copyright 2017 Palantir Technologies, Inc. All rights reserved.
 * Licensed under the BSD-3 License as modified (the “License”); you may obtain a copy
 * of the license at https://github.com/palantir/blueprint/blob/master/LICENSE
 * and https://github.com/palantir/blueprint/blob/master/PATENTS
 */

import * as classNames from "classnames";
import * as moment from "moment-timezone";
import * as PureRender from "pure-render-decorator";
import * as React from "react";

import {
    AbstractComponent,
    Classes as CoreClasses,
    Icon,
    IconName,
    IPopoverProps,
    IProps,
    MenuItem,
    Utils,
} from "@blueprintjs/core";
import {
    ISelectItemRendererProps,
    Select,
} from "..";
import * as Classes from "../../common/classes";

export interface ITimezoneInputProps extends IProps {
    /**
     * The currently selected timezone (IANA time zone identifier).
     * If this prop is provided, the component acts in a controlled manner.
     */
    value?: string;

    /**
     * Callback invoked when the user changes the timezone.
     */
    onChange: (timezone: string) => void;

    /**
     * The date to use when determining timezone offsets.
     * A timezone usually has more than one offset from UTC due to daylight saving time.
     * @default now
     */
    date?: Date;

    /**
     * Initial timezone that will display as selected.
     * This should not be set if `value` is set.
     */
    defaultValue?: string;

    /**
     * Use the local timezone as the default timezone.
     * Note that `defaultValue` takes precedence over this prop.
     * @default false
     */
    defaultToLocalTimezone?: boolean;

    /**
     * Whether to show the local timezone at the top of the list of initial timezone suggestions.
     * @default true
     */
    showLocalTimezone?: boolean;

    /**
     * Format to use when displaying the selected (or default) timezone within the target element.
     * @default TimezoneFormat.OFFSET
     */
    targetDisplayFormat?: TimezoneDisplayFormat;

    /**
     * A space-delimited list of class names to pass along to the target element.
     */
    targetClassName?: string;

    /**
     * Whether this component is non-interactive.
     * @default false
     */
    disabled?: boolean;

    /**
     * Text to show when no timezone has been selected and there is no default.
     * @default GMT timezone formatted according to `targetDisplayFormat`
     */
    placeholder?: string;

    /** Props to spread to `Popover`. Note that `content` cannot be changed. */
    popoverProps?: Partial<IPopoverProps> & object;
}

export type TimezoneDisplayFormat = "offset" | "abbreviation" | "name";
export const TimezoneDisplayFormat = {
    ABBREVIATION: "abbreviation" as "abbreviation",
    NAME: "name" as "name",
    OFFSET: "offset" as "offset",
};

export interface ITimezoneInputState {
    selectedTimezone?: string;
    query?: string;
}

interface ITimezoneItem {
    key: string;
    text: string;
    label: string;
    iconName: IconName | undefined;
    timezone: string;
}

const TypedSelect = Select.ofType<ITimezoneItem>();

const PLACEHOLDER_TIMEZONE = "GMT";

@PureRender
export class TimezoneInput extends AbstractComponent<ITimezoneInputProps, ITimezoneInputState> {
    public static displayName = "Blueprint.TimezoneInput";

    public static defaultProps: Partial<ITimezoneInputProps> = {
        defaultToLocalTimezone: false,
        disabled: false,
        popoverProps: {},
        showLocalTimezone: true,
    };

    private timezones: ITimezoneItem[];
    private timezoneToQueryCandidates: { [timezone: string]: string[] };
    private initialTimezones: ITimezoneItem[];

    constructor(props: ITimezoneInputProps, context?: any) {
        super(props, context);

        this.state = {
            selectedTimezone: props.value,
        };

        this.updateTimezones(props);
        this.updateInitialTimezones(props);
    }

    public render() {
        const { className, disabled, popoverProps, targetClassName } = this.props;
        const { selectedTimezone } = this.state;
        const { query } = this.state;
        const finalPopoverProps: Partial<IPopoverProps> & object = {
            ...popoverProps,
            popoverClassName: classNames(popoverProps.popoverClassName, Classes.TIMEZONE_INPUT_POPOVER),
        };
        const isPlaceholder = !selectedTimezone;
        const targetTextClasses = classNames({ [CoreClasses.TEXT_MUTED]: isPlaceholder });
        const targetIconClasses = classNames(CoreClasses.ALIGN_RIGHT, { [CoreClasses.TEXT_MUTED]: isPlaceholder });

        return (
            <TypedSelect
                className={classNames(Classes.TIMEZONE_INPUT, className)}
                items={query ? this.timezones : this.initialTimezones}
                itemListPredicate={this.filterTimezones}
                itemRenderer={this.renderItem}
                noResults={<MenuItem disabled text="No matching timezones." />}
                onItemSelect={this.handleItemSelect}
                resetOnSelect={true}
                resetOnClose={true}
                popoverProps={finalPopoverProps}
                disabled={disabled}
                onQueryChange={this.handleQueryChange}
            >
                <button
                    className={classNames(Classes.TIMEZONE_INPUT_TARGET, CoreClasses.INPUT, targetClassName)}
                    disabled={disabled}
                >
                    <span className={targetTextClasses}>{this.getTargetText()}</span>
                    <Icon iconName="caret-down" className={targetIconClasses} />
                </button>
            </TypedSelect>
        );
    }

    public componentWillReceiveProps(nextProps: ITimezoneInputProps) {
        if (this.props.date.getTime() !== nextProps.date.getTime()) {
            this.updateTimezones(nextProps);
        }
        if (this.props.date.getTime() !== nextProps.date.getTime() ||
            this.props.showLocalTimezone !== nextProps.showLocalTimezone) {
            this.updateInitialTimezones(nextProps);
        }
        if (this.state.selectedTimezone !== nextProps.value) {
            this.setState({ selectedTimezone: nextProps.value });
        }
    }

    private updateTimezones(props: ITimezoneInputProps): void {
        const timezones = getTimezoneItems(props.date);
        this.timezones = timezones;
        this.timezoneToQueryCandidates = getTimezoneQueryCandidates(timezones, props.date);
    }

    private updateInitialTimezones(props: ITimezoneInputProps): void {
        this.initialTimezones = getInitialTimezoneItems(props.date, props.showLocalTimezone);
    }

    private getTargetText(): string {
        const {
            date,
            defaultValue,
            defaultToLocalTimezone,
            targetDisplayFormat = TimezoneDisplayFormat.OFFSET,
            placeholder,
        } = this.props;
        const { selectedTimezone } = this.state;
        const timezone = selectedTimezone || defaultValue || (defaultToLocalTimezone && getLocalTimezone());
        const timezoneExists = timezone && moment.tz.zone(timezone) != null;

        if (timezoneExists) {
            return formatTimezone(timezone, date, targetDisplayFormat);
        } else if (placeholder !== undefined) {
            return placeholder;
        } else {
            return formatTimezone(PLACEHOLDER_TIMEZONE, date, targetDisplayFormat);
        }
    }

    private filterTimezones = (query: string, items: ITimezoneItem[]): ITimezoneItem[] => {
        const normalizedQuery = normalizeText(query);
        return items.filter((item) => {
            const candidates = this.timezoneToQueryCandidates[item.timezone] || [normalizeText(item.timezone)];
            return candidates.some((candidate) => isQueryMatch(normalizedQuery, candidate));
        });
    }

    private renderItem = (itemProps: ISelectItemRendererProps<ITimezoneItem>) => {
        const { item, isActive, handleClick } = itemProps;
        const classes = classNames(CoreClasses.MENU_ITEM, CoreClasses.intentClass(), {
            [CoreClasses.ACTIVE]: isActive,
            [CoreClasses.INTENT_PRIMARY]: isActive,
        });

        return (
            <MenuItem
                key={item.key}
                className={classes}
                iconName={item.iconName}
                text={item.text}
                label={item.label}
                onClick={handleClick}
                shouldDismissPopover={false}
            />
        );
    }

    private handleItemSelect = (timezone: ITimezoneItem) => {
        if (this.props.value === undefined) {
            this.setState({ selectedTimezone: timezone.timezone });
        }
        Utils.safeInvoke(this.props.onChange, timezone.timezone);
    }

    private handleQueryChange = (query: string) => {
        this.setState({ query });
    }
}

function getTimezoneItems(date: Date): ITimezoneItem[] {
    return moment.tz.names().map((timezone) => toTimezoneItem(timezone, date));
}

function getInitialTimezoneItems(date: Date, includeLocalTimezone: boolean): ITimezoneItem[] {
    const populous = getPopulousTimezoneItems(date);
    const local = includeLocalTimezone ? getLocalTimezoneItem(date) : undefined;
    return local ? [local, ...populous] : populous;
}

function getPopulousTimezoneItems(date: Date): ITimezoneItem[] {
    const timezones = moment.tz.names()
        .filter((timezone) => (
            // Filter out noisy timezones
            // See https://github.com/moment/moment-timezone/issues/227
            /\//.test(timezone) &&
            !/Etc\//.test(timezone)
        ));

    const timezoneToMetadata: { [timezone: string]: ITimezoneMetadata } = {};
    for (const timezone of timezones) {
        timezoneToMetadata[timezone] = getTimezoneMetadata(timezone, date);
    }

    // Order by offset ascending, population descending, timezone name ascending
    timezones.sort((timezone1, timezone2) => {
        const { offset: offset1, population: population1 } = timezoneToMetadata[timezone1];
        const { offset: offset2, population: population2 } = timezoneToMetadata[timezone2];
        if (offset1 === offset2) {
            if (population1 === population2) {
                // Fall back to sorting alphabetically
                return timezone1 < timezone2 ? -1 : 1;
            }
            // Descending order of population
            return population2 - population1;
        }
        // Ascending order of offset
        return offset1 - offset2;
    });

    // Choose the most populous locations for each offset
    const initialTimezones: ITimezoneItem[] = [];
    let prevOffset: number;
    for (const timezone of timezones) {
        const curOffset = timezoneToMetadata[timezone].offset;
        if (prevOffset === undefined || prevOffset !== curOffset) {
            initialTimezones.push(toTimezoneItem(timezone, date));
            prevOffset = curOffset;
        }
    }
    return initialTimezones;
}

function getLocalTimezoneItem(date: Date): ITimezoneItem | undefined {
    const timezone = getLocalTimezone();
    if (timezone) {
        const timestamp = date.getTime();
        const zonedDate = moment.tz(timestamp, timezone);
        const offsetAsString = zonedDate.format("Z");
        return {
            iconName: "locate",
            key: `${timezone}-local`,
            label: offsetAsString,
            text: "Current timezone",
            timezone,
        };
    } else {
        return undefined;
    }
}

/**
 * Get the local timezone.
 * Note that we are not guaranteed to get the correct timezone in all browsers,
 * so this is a best guess.
 * https://momentjs.com/timezone/docs/#/using-timezones/guessing-user-timezone/
 */
function getLocalTimezone(): string {
    return moment.tz.guess();
}

function getTimezoneQueryCandidates(timezones: ITimezoneItem[], date: Date): { [timezone: string]: string[] } {
    const timezoneToQueryCandidates: { [timezone: string]: string[] } = {};

    for (const { timezone } of timezones) {
        const { abbreviation, offsetAsString } = getTimezoneMetadata(timezone, date);
        const candidates = [
            timezone,
            abbreviation,
            offsetAsString,

            // Split timezone string.
            // For example, "America/Los_Angeles" -> "America Los Angeles"
            timezone.split(/[/_]/).join(" "),

            // Don't require leading offset 0.
            // For example, "-07:00" -> "-7:00"
            offsetAsString.replace(/^([+-])0(\d:\d{2})$/, "$1$2"),
        ].map(normalizeText);

        timezoneToQueryCandidates[timezone] = timezoneToQueryCandidates[timezone] || [];
        timezoneToQueryCandidates[timezone].push(...candidates);
    }

    return timezoneToQueryCandidates;
}

function toTimezoneItem(timezone: string, date: Date): ITimezoneItem {
    const { abbreviation, offsetAsString } = getTimezoneMetadata(timezone, date);
    return {
        iconName: undefined,
        key: timezone,
        label: offsetAsString,
        text: timezone + (abbreviation ? ` (${abbreviation})` : ""),
        timezone,
    };
}

interface ITimezoneMetadata {
    timezone: string;
    abbreviation: string;
    offset: number;
    offsetAsString: string;
    population: number;
}

function getTimezoneMetadata(timezone: string, date: Date): ITimezoneMetadata {
    const timestamp = date.getTime();
    const zone = moment.tz.zone(timezone);
    const zonedDate = moment.tz(timestamp, timezone);
    const offset = zonedDate.utcOffset();
    const offsetAsString = zonedDate.format("Z");
    const abbreviation = getAbbreviation(timezone, timestamp);
    const population = (zone && (zone as any).population) || 0;

    return {
        timezone,
        abbreviation,
        offset,
        offsetAsString,
        population,
    };
}

function getAbbreviation(timezone: string, timestamp: number): string {
    const zone = moment.tz.zone(timezone);
    if (zone) {
        const abbreviation = zone.abbr(timestamp);

        // Only include abbreviations that are not just a repeat of the offset
        if (abbreviation.length > 0 && abbreviation[0] !== "-" && abbreviation[0] !== "+") {
            return abbreviation;
        }
    }

    return "";
}

function formatTimezone(timezone: string, date: Date, targetDisplayFormat: TimezoneDisplayFormat): string {
    switch (targetDisplayFormat) {
        case TimezoneDisplayFormat.ABBREVIATION:
            return moment.tz(date.getTime(), timezone).format("z");
        case TimezoneDisplayFormat.NAME:
            return timezone;
        case TimezoneDisplayFormat.OFFSET:
            return moment.tz(date.getTime(), timezone).format("Z");
        default:
            assertNever(targetDisplayFormat);
            return "";
    }
}

function isQueryMatch(query: string, candidate: string) {
    return candidate.indexOf(query) >= 0;
}

function normalizeText(text: string): string {
    return text.toLowerCase();
}

function assertNever(x: never): never {
    throw new Error("Unexpected value: " + x);
}
