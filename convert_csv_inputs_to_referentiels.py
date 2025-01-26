from csv import DictReader
from functools import partial
from itertools import chain
from json import dumps, load
from operator import attrgetter, itemgetter
from pathlib import Path

# FIXME mise dependencies + in2csv ?
departements_by_intitule = {
    departement["intitule"]: departement
    for departement in load(Path("./data/departements.json").open())
}

csv = Path("inputs/csv")
input_communes_banatic = list(DictReader((csv / "communes_siren.csv").open()))

input_communes_insee = list(DictReader((csv / "communes_2024.csv").open()))
input_communes_insee_by_code_insee = {
    commune["COM"]: commune
    for commune in input_communes_insee
    if commune["TYPECOM"] == "COM"
}


print(
    f"All CSV files parsed successfully. {len(input_communes_banatic)} {len(input_communes_insee)}"
)


def format_commune(commune_banatic):
    code_commune = commune_banatic["Code INSEE de la commune"]
    commune_insee = input_communes_insee_by_code_insee[code_commune]
    return {
        "code": code_commune,
        "siren": commune_banatic["Siren"],
        "type": commune_insee["TYPECOM"],
        "intitule": commune_insee["LIBELLE"],
        "regionCode": commune_insee["REG"],
        "departementCode": commune_insee["DEP"],
        "groupements": [],
        "membres": [],
        "intercommunaliteCode": "",
        "competencePLU": True,
        "competenceSCOT": False,
    }


def membres_de_groupement():
    for f in sorted(Path("./inputs/json").glob("*.json"), key=attrgetter("name")):
        print(f"Processing file: {f.name}")
        yield from load(f.open())


commune_by_code_insee = {}
commune_by_siren = {}
for commune_banatic in input_communes_banatic:
    commune = format_commune(commune_banatic)
    commune_by_code_insee[commune["code"]] = commune
    commune_by_siren[commune["siren"]] = commune

compositions_EPCI = DictReader((csv / "Composition_communale-Table 1.csv").open())
compositions_EPT = DictReader((csv / "Composition_communale-Table_EPT.csv").open())
for commune in chain(compositions_EPCI, compositions_EPT):
    insee = commune["CODGEO"]
    epci = commune.get("EPCI")
    if epci and "Z" not in epci:
        commune_by_code_insee[insee]["intercommunaliteCode"] = epci

missing_communes = []
for commune in input_communes_insee:
    if commune["TYPECOM"] not in ["COMD", "COMA"]:
        if commune["COM"] not in commune_by_code_insee:
            missing_communes.append(commune)
            print(f"missing commune in Banatic {commune['COM']}")
        continue

    commune_by_code_insee[commune["COM"] + "_COMD"] = {
        "code": commune["COM"],
        "codeParent": commune["COMPARENT"],
        "siren": "",
        "type": commune["TYPECOM"],
        "intitule": commune["LIBELLE"],
        "regionCode": commune["REG"],
        "departementCode": commune["DEP"],
        "groupements": [],
        "membres": [],
        "intercommunaliteCode": "",
        "competencePLU": False,
        "competenceSCOT": False,
    }

    parent = commune_by_code_insee[commune["COMPARENT"]]
    parent["membres"].append(
        {
            "code": commune["COM"],
            "type": commune["TYPECOM"],
            "intitule": commune["LIBELLE"],
        }
    )

groupements_by_siren = {}
for membre in membres_de_groupement():
    siren_groupement = membre["N° SIREN"]
    if siren_groupement in groupements_by_siren:
        continue

    departement = departements_by_intitule[membre["Département"]]
    groupements_by_siren[siren_groupement] = {
        "type": membre["Nature juridique"],
        "intitule": membre["Nom du groupement"],
        "siren": siren_groupement,
        "code": siren_groupement,
        "regionCode": departement["region"]["code"],
        "departementCode": departement["code"],
        "competencePLU": "OUI"
        == membre[
            "5510 - Plan local d'urbanisme et document d'urbanisme en tenant lieu (Art. L. 153-1 du code de l'urbanisme)"
        ],
        "competenceSCOT": "OUI"
        == membre[
            "5500 - Schéma de cohérence territoriale (SCOT) (Art. L. 143-16 code de l'urbanisme)"
        ],
        "membres": [],
        "groupements": [],
    }


missing_membres = []
for membre in membres_de_groupement():
    siren_mem = membre["Siren membre"]
    membre_obj = commune_by_siren.get(siren_mem) or groupements_by_siren.get(siren_mem)
    if not membre_obj:
        missing_membres.append(siren_mem)
        continue

    siren_groupement = membre["N° SIREN"]
    groupement = groupements_by_siren[siren_groupement]

    membre_obj["groupements"].append(
        {
            "type": membre["Nature juridique"],
            "intitule": membre["Nom du groupement"],
            "siren": siren_groupement,
            "code": siren_groupement,
        }
    )

    if groupement["competencePLU"]:
        membre_obj["competencePLU"] = False

    groupement["membres"].append(
        {
            "type": membre_obj["type"],
            "intitule": membre_obj["intitule"],
            "siren": siren_mem,
            "code": membre_obj["code"],
        }
    )


print(f"groupementsMap {len(groupements_by_siren)}")
print(f"communesInseeMap {len(commune_by_code_insee)}")
print(
    f"Missing communes: {len(missing_communes)}, missing membres: {len(missing_membres)}"
)

searchable_groupements = [
    groupement
    for groupement in groupements_by_siren.values()
    if groupement["competencePLU"] or groupement["competenceSCOT"]
]
print(f"searchableGroupements {len(searchable_groupements)}")

jason = partial(dumps, indent=2, ensure_ascii=False)

Path("./output/communes_2024_map.json").write_text(jason(commune_by_code_insee))
Path("./output/communes_2024.json").write_text(
    jason(sorted(commune_by_code_insee.values(), key=itemgetter("code")))
)


Path("./output/groupements_2024.json").write_text(
    jason(sorted(groupements_by_siren.values(), key=itemgetter("code")))
)
Path("./output/groupements_2024_map.json").write_text(jason(groupements_by_siren))
Path("./output/groupements_competents_2024.json").write_text(
    jason(sorted(searchable_groupements, key=itemgetter("code")))
)
