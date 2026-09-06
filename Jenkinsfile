@Library('ci-cd-jenkins-lib@main') _

standardAppPipelineManaged_v2(
    appName: 'alertbox-org-api',
    orgName: 'Ponlponl123-Labs',
    gitOpsRepo: 'Ponlponl123/.gitops',

    // Multi-manifest target specification:
    bumpIncludes: [
        [file: 'api-deployment',    path: 'app/alertbox-org/'],
        [file: 'api-migration-job', path: 'app/alertbox-org/']
    ],

    branchName: 'main',
    imageRepo: 'alertbox-org-api',
    gitopsProtocol: 'git@',
    gitopsCreds: 'github-ponlponl123-ssh-gitops'
)
