from setuptools import setup, find_packages

setup(
    name="secureflex-intel",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["pyyaml>=6.0"],
    entry_points={
        "console_scripts": [
            "sf-intel=secureflex_intel.cli:main",
        ],
    },
)
