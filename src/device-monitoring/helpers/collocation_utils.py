import copy
import math
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from helpers.convert_dates import format_date, validate_date
from models import (
    DataCompleteness,
    IntraSensorCorrelation,
    BaseResult,
    DataCompletenessResult,
    IntraSensorCorrelationResult,
)


def populate_missing_columns(data: pd.DataFrame, cols: list) -> pd.DataFrame:
    for col in cols:
        if col not in list(data.columns):
            print(f"{col} missing in dataset")
            data.loc[:, col] = None

    return data


def dates_array(start_date_time: datetime, end_date_time: datetime) -> list[datetime]:
    dates: list[datetime] = []
    varying_date = format_date(start_date_time, str_format="%Y-%m-%dT%H:00:00.000Z")
    while varying_date < end_date_time:
        dates.append(varying_date)
        varying_date = varying_date + timedelta(hours=1)
    return list(set(dates))


def validate_collocation_request(
    devices,
    start_date,
    end_date,
) -> dict:
    errors = {}
    try:
        if not devices or not isinstance(
            devices, list
        ):  # TODO add device restrictions e.g not more that 3 devices
            raise Exception
    except Exception:
        errors["devices"] = "Provide a list of devices"

    try:
        start_date = validate_date(start_date)
    except Exception:
        errors["startDate"] = (
            "This query param is required."
            "Please provide a valid date formatted datetime string (%Y-%m-%d)"
        )

    try:
        end_date = validate_date(end_date)
    except Exception:
        errors["endDate"] = (
            "This query param is required."
            "Please provide a valid date formatted datetime string (%Y-%m-%d)"
        )

    if (
        start_date > end_date
    ):  # TODO add interval restrictions e.g not more that 10 days
        errors["dates"] = "endDate must be greater or equal to the startDate"

    return errors


def device_pairs(devices: list[str]) -> list[list[str]]:
    devices = list(set(devices))
    pairs = []
    for device_x in devices:
        for device_y in devices:
            if (device_x == device_y) or ([device_y, device_x] in pairs):
                continue
            pairs.append([device_x, device_y])

    return pairs


def compute_differences(
    statistics: list[dict],
    parameter: str,
    threshold: int,
    base_device: str,
    devices: list[str],
) -> BaseResult:
    statistics_list = copy.copy(statistics)
    differences = []
    # TODO compute base device
    data: dict[str, dict] = {}
    for device_statistics in statistics_list:
        device = device_statistics.pop("device_name")
        data[device] = device_statistics

    pairs = device_pairs(list(data.keys()))
    passed_devices = []
    failed_devices = []

    for device_pair in pairs:
        device_x = device_pair[0]
        device_y = device_pair[1]

        device_x_data = pd.DataFrame([data.get(device_x)])
        device_y_data = pd.DataFrame([data.get(device_y)])

        differences_df = abs(device_x_data - device_y_data)
        differences_df.replace(np.nan, None, inplace=True)
        results = differences_df.to_dict("records")

        try:
            results = results[0]
            passed = (
                results[f"{parameter}_mean"] <= threshold
                if results[f"{parameter}_mean"]
                else False
            )
        except IndexError:
            results = []
            passed = False

        differences.append(
            {
                "devices": device_pair,
                "passed": passed,
                "differences": results,
            }
        )

        if passed:
            passed_devices.extend([device_x, device_y])
        else:
            failed_devices.extend([device_x, device_y])

    passed_devices = list(set(passed_devices))
    failed_devices = list(set(failed_devices).difference(set(passed_devices)))
    neutral_devices = list(
        set(devices).difference(set(passed_devices)).difference(set(failed_devices))
    )
    return BaseResult(
        passed_devices=passed_devices,
        failed_devices=failed_devices,
        neutral_devices=neutral_devices,
        results=differences,
    )


def compute_devices_inter_sensor_correlation(
    data: dict[str, pd.DataFrame],
    device_x: str,
    device_y: str,
    correlation_cols: list,
    threshold: float,
    r2_threshold: float,
    parameter: str,
) -> dict:
    device_x_data = data.get(device_x, pd.DataFrame())

    device_x_data = device_x_data[correlation_cols]
    device_x_data = device_x_data.add_prefix(f"{device_x}_")
    device_x_data.rename(columns={f"{device_x}_timestamp": "timestamp"}, inplace=True)

    device_y_data = data.get(device_y, pd.DataFrame())
    device_y_data = device_y_data[correlation_cols]
    device_y_data = device_y_data.add_prefix(f"{device_y}_")
    device_y_data.rename(columns={f"{device_y}_timestamp": "timestamp"}, inplace=True)

    device_pair_data = pd.merge(
        left=device_x_data,
        right=device_y_data,
        on=["timestamp"],
    )
    device_pair_data = device_pair_data.select_dtypes(include="number")

    device_pair_correlation = {}

    for col in correlation_cols:
        try:
            if col == "timestamp":
                continue

            comp_cols = [f"{device_x}_{col}", f"{device_y}_{col}"]

            device_pair_correlation_data = device_pair_data[comp_cols].corr().round(4)
            device_pair_correlation_data.replace(np.nan, None, inplace=True)
            correlation_value = device_pair_correlation_data.iloc[0][comp_cols[1]]
            device_pair_correlation[f"{col}_pearson"] = correlation_value

            device_pair_correlation[f"{col}_r2_pearson"] = math.sqrt(correlation_value)
        except Exception:
            device_pair_correlation[f"{col}_r2_pearson"] = None

    parameter_value = device_pair_correlation.get(f"{parameter}_pearson", None)
    parameter_r2_value = device_pair_correlation.get(f"{parameter}_r2_pearson", None)

    passed = False if parameter_value is None else bool(parameter_value >= threshold)
    if passed:
        passed = (
            False
            if parameter_r2_value is None
            else bool(parameter_r2_value >= r2_threshold)
        )
    device_pair_correlation["passed"] = passed
    device_pair_correlation["devices"] = [device_x, device_y]

    return device_pair_correlation


def compute_inter_sensor_correlation(
    devices: list[str],
    data: dict[str, pd.DataFrame],
    threshold: float,
    r2_threshold: float,
    parameter: str,
    base_device: str,
    other_parameters: list[str],
) -> BaseResult:
    passed_devices: list[str] = []
    failed_devices: list[str] = []
    results: list[dict] = []

    correlation_cols = ["timestamp", parameter]
    correlation_cols.extend(other_parameters)
    correlation_cols = list(set(correlation_cols))

    if base_device is not None and base_device != "":
        for device in data.keys():
            if device == base_device:
                continue

            device_pair_correlation = compute_devices_inter_sensor_correlation(
                correlation_cols=correlation_cols,
                device_x=base_device,
                device_y=device,
                data=data,
                parameter=parameter,
                threshold=threshold,
                r2_threshold=r2_threshold,
            )

            results.append(device_pair_correlation)

            if device_pair_correlation["passed"]:
                passed_devices.append(device)
            else:
                failed_devices.append(device)

    else:
        passed_pairs: list[tuple[str, str]] = []
        pairs = device_pairs(devices)

        for device_pair in pairs:
            device_x = device_pair[0]
            device_y = device_pair[1]

            device_pair_correlation = compute_devices_inter_sensor_correlation(
                correlation_cols=correlation_cols,
                device_x=device_x,
                device_y=device_y,
                data=data,
                parameter=parameter,
                threshold=threshold,
                r2_threshold=r2_threshold,
            )

            results.append(device_pair_correlation)

            if device_pair_correlation["passed"]:
                passed_pairs.append((device_x, device_y))
            else:
                failed_devices.extend([device_x, device_y])

            while len(passed_pairs) != 0:
                first_pair = passed_pairs[0]
                if len(passed_devices) == 0:
                    passed_devices = list(first_pair)

                passed_devices = list(set(passed_devices).intersection(set(first_pair)))
                passed_pairs.remove(first_pair)

    failed_devices = list(set(failed_devices).difference(set(passed_devices)))
    neutral_devices = list(
        set(devices).difference(set(passed_devices)).difference(set(failed_devices))
    )

    return BaseResult(
        results=results,
        passed_devices=passed_devices,
        failed_devices=failed_devices,
        neutral_devices=neutral_devices,
    )


def compute_intra_sensor_correlation(
    devices: list[str],
    data: dict[str, pd.DataFrame],
    threshold: float,
    parameter: str,
    r2_threshold: float,
) -> IntraSensorCorrelationResult:
    correlation: list[IntraSensorCorrelation] = []

    for device in devices:
        device_data = data.get(device, pd.DataFrame())
        if len(device_data.index) == 0:
            device_correlation = IntraSensorCorrelation(
                device_name=device,
                pm2_5_pearson=None,
                pm10_pearson=None,
                pm2_5_r2=None,
                pm10_r2=None,
                passed=False,
            )
            correlation.append(device_correlation)
            continue

        pm2_5_pearson = device_data[["s1_pm2_5", "s2_pm2_5"]].corr().round(4)
        pm2_5_pearson = pm2_5_pearson.iloc[0]["s2_pm2_5"]
        pm10_pearson = device_data[["s1_pm10", "s2_pm10"]].corr().round(4)
        pm10_pearson = pm10_pearson.iloc[0]["s2_pm10"]
        pm2_5_r2 = None
        pm10_r2 = None

        try:
            pm2_5_r2 = math.sqrt(pm2_5_pearson)
            pm10_r2 = math.sqrt(pm10_pearson)
        except Exception:
            pass

        pm2_5_pearson = None if pm2_5_pearson is np.NAN else pm2_5_pearson
        pm10_pearson = None if pm10_pearson is np.NAN else pm10_pearson

        if parameter == "pm10":
            passed = bool(pm10_pearson >= threshold) if pm10_pearson else False
            if passed:
                passed = pm10_r2 >= r2_threshold if pm10_r2 else False
        else:
            passed = bool(pm2_5_pearson >= threshold) if pm2_5_pearson else False
            if passed:
                passed = pm2_5_r2 >= r2_threshold if pm2_5_r2 else False

        device_correlation = IntraSensorCorrelation(
            device_name=device,
            pm2_5_pearson=pm2_5_pearson,
            pm10_pearson=pm10_pearson,
            pm2_5_r2=pm2_5_r2,
            pm10_r2=pm10_r2,
            passed=passed,
        )
        correlation.append(device_correlation)

    passed_devices = list(filter(lambda x: x.passed is True, correlation))
    passed_devices = [x.device_name for x in passed_devices]
    failed_devices = list(filter(lambda x: x.passed is False, correlation))
    failed_devices = [x.device_name for x in failed_devices]
    neutral_devices = list(
        set(devices).difference(set(passed_devices)).difference(set(failed_devices))
    )

    return IntraSensorCorrelationResult(
        results=correlation,
        passed_devices=passed_devices,
        failed_devices=failed_devices,
        neutral_devices=neutral_devices,
    )


def compute_statistics(data: dict[str, pd.DataFrame]) -> list[dict]:
    statistics = []
    for device, device_data in data.items():
        device_statistics = {}
        df_filtered = device_data.select_dtypes(include=["number"])

        for col in df_filtered.columns.to_list():
            col_statistics = df_filtered[col].describe()
            col_statistics.replace(np.nan, None, inplace=True)
            device_statistics = {
                **device_statistics,
                **{
                    f"{col}_mean": col_statistics["mean"],
                    f"{col}_std": col_statistics["std"],
                    f"{col}_min": col_statistics["min"],
                    f"{col}_max": col_statistics["max"],
                    f"{col}_25_percentile": col_statistics["25%"],
                    f"{col}_50_percentile": col_statistics["50%"],
                    f"{col}_75_percentile": col_statistics["75%"],
                },
            }

        statistics.append({**device_statistics, **{"device_name": device}})

    statistics_df = pd.DataFrame(statistics)
    statistics_df.replace(np.nan, None, inplace=True)
    return statistics_df.to_dict("records")


def compute_data_completeness(
    data: dict[str, pd.DataFrame],
    devices: list[str],
    expected_hourly_records: int,
    parameter: str,
    threshold: float,
    start_date_time: datetime,
    end_date_time: datetime,
) -> DataCompletenessResult:
    data = data.copy()
    dates = dates_array(start_date_time=start_date_time, end_date_time=end_date_time)

    expected_records = len(dates) * expected_hourly_records
    completeness: list[DataCompleteness] = []

    for device in devices:
        device_data = data.get(device, pd.DataFrame())
        device_data.dropna(subset=[parameter], inplace=True)
        device_completeness = len(device_data.index) / expected_records
        device_completeness = 1 if device_completeness > 1 else device_completeness

        completeness.append(
            DataCompleteness(
                device_name=device,
                actual=len(device_data.index),
                expected=expected_records,
                completeness=device_completeness,
                missing=1 - device_completeness,
                passed=device_completeness >= threshold,
            )
        )

        # if len(device_data.index) == 0:
        #     completeness.append(
        #         DataCompleteness(
        #             device_name=device,
        #             actual=len(device_data.index),
        #             expected=expected_records,
        #             completeness=0,
        #             missing=1,
        #             passed=False,
        #         )
        #     )
        #     continue
        # device_data["timestamp"] = device_data["timestamp"].apply(
        #     lambda x: format_date(x, str_format="%Y-%m-%dT%H:00:00.000Z")
        # )
        # device_data.dropna(subset=[parameter], inplace=True)

        # device_hourly_list = []
        # for hour in dates:
        #
        #     hourly_data = device_data[device_data["timestamp"] == hour]
        #     hourly_completeness = (
        #         hourly_data[parameter].count() / expected_records
        #     )
        #     hourly_completeness = 1 if hourly_completeness > 1 else hourly_completeness
        #     device_hourly_list.append(hourly_completeness)
        #
        # device_completeness = sum(device_hourly_list) / len(device_hourly_list)

        # completeness.append(
        #     DataCompleteness(
        #         device_name=device,
        #         actual=len(device_data.index),
        #         expected=expected_records,
        #         completeness=device_completeness,
        #         missing=1 - device_completeness,
        #         passed=bool(device_completeness >= expected_records),
        #     )
        # )
    passed_devices = list(filter(lambda x: x.passed is True, completeness))
    passed_devices = [x.device_name for x in passed_devices]
    failed_devices = list(filter(lambda x: x.passed is False, completeness))
    failed_devices = [x.device_name for x in failed_devices]
    neutral_devices = list(
        set(devices).difference(set(passed_devices)).difference(set(failed_devices))
    )
    return DataCompletenessResult(
        results=completeness,
        passed_devices=passed_devices,
        failed_devices=failed_devices,
        neutral_devices=neutral_devices,
    )


def map_data_to_api_format(data: list) -> dict[str, dict]:
    api_data = {}
    for row in data:
        data = copy.deepcopy(row)
        device = data.pop("device_name")
        api_data[device] = data

    return api_data
