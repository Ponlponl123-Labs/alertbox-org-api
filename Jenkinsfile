@Library('ci-cd-jenkins-lib@main') _

standardAppPipelineManaged_Defaulted(
  appName: 'alertbox-org-api',
  orgName: 'Ponlponl123-Labs',
  gitOpsRepo: 'Ponlponl123/.gitops',
  
  // main deployment
  deploymentName: 'api-deployment',
  deploymentFilePath: 'app/alertbox-org/',

  // additional file for CI to bump image tag
  additionalDeploymentName: 'api-migration-job',
  additionalDeploymentFilePath: 'app/alertbox-org/',

  branchName: 'main', 
  imageRepo: 'alertbox-org-api',

  gitopsProtocol: 'git@',
  gitopsCreds: 'github-ponlponl123-ssh-gitops'
)