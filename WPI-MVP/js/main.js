require([
    "esri/views/MapView",
    "esri/WebMap",
    "esri/widgets/LayerList",
    "esri/widgets/Expand",
    "esri/layers/GraphicsLayer",
    "esri/widgets/Sketch/SketchViewModel",
], (MapView, WebMap, LayerList, Expand, GraphicsLayer, SketchViewModel) => {
    let highlight = null;
    let chart = null;

    const turbineLayerName = "Turbine Locations";

    const webmap = new WebMap({
        portalItem: {
            id:
                new URLSearchParams(window.location.search).get("week") != null
                    ? "b3aa1ba4bdb24dbdacf75c8e2675b43d"
                    : "52cebcfde931428bae8f7fc309b93860",
        },
    });

    const view = new MapView({
        container: "viewDiv",
        popupEnabled: false,
    });

    webmap.load().then(() => {
        webmap.allLayers
            .filter((layer) => layer.title === turbineLayerName)
            .at(0).outFields = ["*"];
        webmap.add(polygonGraphicsLayer);
        view.map = webmap;
    });

    const polygonGraphicsLayer = new GraphicsLayer({ listMode: "hide" });

    const sketchViewModel = new SketchViewModel({
        view: view,
        layer: polygonGraphicsLayer,
        polygonSymbol: {
            type: "simple-fill",
            color: [255, 255, 255, 0.5],
            outline: {
                color: [255, 255, 255],
                width: 2,
            },
        },
        updateOnGraphicClick: false,
    });

    view.when(() => {
        const layerList = new LayerList({
            view: view,
            container: document.createElement("div"),
        });

        const llExpand = new Expand({
            view: view,
            content: layerList,
        });

        view.ui.add(llExpand, "top-left");
        view.ui.add("select-by-rectangle", "top-left");
        document.getElementById("select-by-rectangle").style.display = "flex";

        const selectButton = document.getElementById("select-by-rectangle");

        selectButton.addEventListener("click", () => {
            deselect(true);
            sketchViewModel.create("polygon");
        });

        sketchViewModel.on("create", async (event) => {
            if (event.state === "complete") {
                view.allLayerViews.items
                    .filter(
                        (layerView) =>
                            layerView.layer.title === turbineLayerName
                    )[0]
                    .queryFeatures({
                        geometry: polygonGraphicsLayer.graphics.at(0).geometry,
                        spatialRelationship: "intersects",
                        returnGeometry: false,
                        outFields: ["*"],
                    })
                    .then((queryResult) => {
                        highlightAndCalculate(
                            queryResult.features
                                .filter(
                                    (result) =>
                                        result.layer.title === turbineLayerName
                                )
                                .map((result) => ({
                                    type: "graphic",
                                    graphic: result,
                                    layer: result.layer,
                                }))
                        );
                    });
            }
        });

        view.on("click", function (event) {
            view.hitTest(event).then((hitTestResult) => {
                highlightAndCalculate(
                    hitTestResult.results
                        .filter(
                            (result) => result.layer.title === turbineLayerName
                        )
                        .map((result) => result)
                );
            });
        });

        hideLoading();
    });

    const highlightAndCalculate = (graphics) => {
        deselect();
        if (graphics.length > 0) {
            highlight = view.allLayerViews.items
                .filter(
                    (layerView) => layerView.layer.title === turbineLayerName
                )[0]
                .highlight(graphics.map((graphic) => graphic.graphic));
            showLoading();
            view.map.tables
                .at(0)
                .queryFeatures({
                    where: `turbine_id in (${graphics
                        .map((graphic) => graphic.graphic.attributes.turbine_id)
                        .join(",")})`,
                    outStatistics: [
                        {
                            statisticType: "sum",
                            onStatisticField: "predicted_output",
                            outStatisticFieldName: "total_energy",
                        },
                    ],
                    groupByFieldsForStatistics: "prediction_time",
                    orderByFields: "prediction_time",
                })
                .then((response) => {
                    document
                        .getElementById("chartDiv")
                        .classList.remove("closed");
                    createChart(graphics.length, response.features);
                });
        } else {
            deselect(true);
        }
    };

    const showLoading = () => {
        document.getElementById("loading").classList.remove("hidden");
    };

    const hideLoading = () => {
        document.getElementById("loading").classList.add("hidden");
    };

    const setupChartEvents = () => {
        const checkboxes =
            document.getElementsByClassName("chartlabelcheckbox");
        for (i = 0; i < checkboxes.length; i++) {
            checkboxes.item(i).addEventListener("change", function () {
                handleCheckboxClick();
            });
        }
        document
            .getElementById("closeChartBtn")
            .addEventListener("click", () => {
                deselect(true);
            });
    };

    const deselect = (closeChart) => {
        closeChart &&
            document.getElementById("chartDiv").classList.add("closed");
        highlight?.remove();
        polygonGraphicsLayer.removeAll();
    };

    const handleCheckboxClick = () => {
        const selectedCheckboxes = [];
        const checkboxes =
            document.getElementsByClassName("chartlabelcheckbox");
        for (i = 0; i < checkboxes.length; i++) {
            if (checkboxes.item(i).checked) {
                selectedCheckboxes.push(
                    checkboxes.item(i).getAttribute("value")
                );
            }
        }
        if (selectedCheckboxes.length >= 2) {
            if (selectedCheckboxes.length > 2) {
                alert("Please only select the starting and ending ticks");
            } else {
                let startingIndex = Math.min(
                    chart.xAxis[0].categories.indexOf(selectedCheckboxes[0]),
                    chart.xAxis[0].categories.indexOf(selectedCheckboxes[1])
                );
                let endingIndex = Math.max(
                    chart.xAxis[0].categories.indexOf(selectedCheckboxes[0]),
                    chart.xAxis[0].categories.indexOf(selectedCheckboxes[1])
                );
                let sum = 0;
                for (i = startingIndex; i <= endingIndex; i++) {
                    sum += chart.yAxis[0].series[0].data[i].y;
                }
                alert(
                    `The total wind power generated for the selected ${
                        chart.title.textStr.match(/(\d+)/)[0]
                    } turbine${
                        parseInt(chart.title.textStr.match(/(\d+)/)[0]) > 1
                            ? "s"
                            : ""
                    } \nbetween \n${
                        chart.xAxis[0].categories[startingIndex]
                    } \nand \n${
                        chart.xAxis[0].categories[endingIndex]
                    } \nis \n${sum} MW`
                );
            }

            for (i = 0; i < checkboxes.length; i++) {
                checkboxes.item(i).checked = false;
            }
        }
    };

    const createChart = (turbineCount, features) => {
        chart = Highcharts.chart("chart", {
            title: {
                text: `Predicted Wind Power Generation for Selected ${turbineCount} Turbine${
                    turbineCount > 1 ? "s" : ""
                }`,
                align: "left",
            },

            yAxis: {
                title: {
                    text: "Predicted Power Generated (MW)",
                },
            },

            xAxis: {
                type: "category",
                labels: {
                    useHTML: true,
                    formatter: function () {
                        return `<label><input type="checkbox" value="${
                            this.value
                        }" class="chartlabelcheckbox">${
                            this.value.indexOf("00:00") > -1
                                ? this.value.substring(
                                      0,
                                      this.value.indexOf(" ")
                                  )
                                : this.value.substring(
                                      this.value.indexOf(" ") + 1
                                  )
                        }</label>`;
                    },
                    step:
                        new URLSearchParams(window.location.search).get(
                            "week"
                        ) != null
                            ? 3
                            : 1,
                    rotation: -45,
                    align: "right"
                },
                categories: features.map((feature) =>
                    Highcharts.dateFormat(
                        "%m/%d/%Y %H:00",
                        feature.attributes.prediction_time
                    )
                ),
            },

            plotOptions: {
                series: {
                    label: {
                        connectorAllowed: false,
                    },
                },
            },

            credits: {
                enabled: false,
            },

            legend: {
                enabled: false,
            },

            series: [
                {
                    name: "Predicted Power Generated (MW)",
                    data: features.map(
                        (feature) => feature.attributes.total_energy
                    ),
                },
            ],
        });
        setupChartEvents();
        hideLoading();
        console.log(chart);
    };
});
